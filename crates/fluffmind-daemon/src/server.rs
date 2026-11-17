//! HTTP contract of the portable daemon (ADR-020 §2): `GET /health`,
//! `PUT|GET /v1/notes`. Same routes, fields and status codes as the former Node daemon.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, Query, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::writer::{
    assert_note_id_writable_by_writer, note_id_for_mesh_writer, parse_writer_identity,
    resolve_note_file_path, NoteError,
};

/// Notes are text; this only bounds a runaway client.
const BODY_LIMIT: usize = 16 * 1024 * 1024;

pub struct Config {
    pub vault: PathBuf,
    pub default_writer: String,
    /// Bearer token; `None` disables the gate (loopback only, enforced at startup).
    pub token: Option<String>,
}

/// Distinguishes concurrent temp files in one process.
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

type Shared = Arc<Config>;

pub struct ApiError(StatusCode, String);

impl ApiError {
    fn bad_request(message: &str) -> Self {
        Self(StatusCode::BAD_REQUEST, message.to_string())
    }
}

impl From<NoteError> for ApiError {
    fn from(error: NoteError) -> Self {
        Self(StatusCode::BAD_REQUEST, error.to_string())
    }
}

impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

pub fn router(config: Config) -> Router {
    let state: Shared = Arc::new(config);
    Router::new()
        .route("/health", get(health))
        .route("/v1/notes", get(get_note).put(put_note))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .layer(middleware::from_fn_with_state(state.clone(), gate))
        .with_state(state)
}

async fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "Not found" }))).into_response()
}

fn tokens_match(expected: &str, given: &str) -> bool {
    // Constant-time on equal lengths; the length itself is not secret.
    expected.len() == given.len()
        && expected
            .bytes()
            .zip(given.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

/// Bearer gate on every route except `/health`.
async fn gate(State(config): State<Shared>, request: Request, next: Next) -> Response {
    if let Some(token) = &config.token {
        let given = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split_once(' '))
            .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("bearer"))
            .map(|(_, token)| token);
        if request.uri().path() != "/health" && !given.is_some_and(|g| tokens_match(token, g)) {
            return ApiError(StatusCode::UNAUTHORIZED, "Unauthorized".into()).into_response();
        }
    }
    next.run(request).await
}

/// With a token set, `/health` only says `ok` (no vault path for anonymous callers).
async fn health(State(config): State<Shared>) -> Json<Value> {
    if config.token.is_some() {
        return Json(json!({ "ok": true }));
    }
    Json(json!({
        "ok": true,
        "vaultPath": config.vault.to_string_lossy(),
        "defaultWriter": config.default_writer,
        "syncMode": "mesh-live",
    }))
}

fn non_blank_str(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
}

async fn put_note(
    State(config): State<Shared>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Response, ApiError> {
    // Keep the `{ error }` shape for the 413 raised by the body limit.
    let body = body.map_err(|e| ApiError(e.status(), e.body_text()))?;
    let body: Value = if body.iter().all(u8::is_ascii_whitespace) {
        json!({})
    } else {
        serde_json::from_slice(&body).map_err(|_| ApiError::bad_request("Invalid JSON body"))?
    };
    let Some(id) = non_blank_str(body.get("id")) else {
        return Err(ApiError::bad_request("Body must include string \"id\""));
    };
    let Some(content) = body.get("content").and_then(Value::as_str) else {
        return Err(ApiError::bad_request(
            "Body must include string \"content\"",
        ));
    };
    let writer =
        non_blank_str(body.get("writer")).map_or(config.default_writer.as_str(), str::trim);

    let result = write_note_local(&config.vault, id, content, writer).await?;
    let status = if result.created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((
        status,
        Json(json!({
            "id": result.id,
            "path": result.path.to_string_lossy(),
            "contentHash": result.content_hash,
            "created": result.created,
            "committed": false,
            "pushed": false,
        })),
    )
        .into_response())
}

async fn get_note(
    State(config): State<Shared>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, ApiError> {
    let Some(id) = params.get("id").filter(|s| !s.trim().is_empty()) else {
        return Err(ApiError::bad_request("Query \"id\" is required"));
    };
    let writer_raw = params
        .get("writer")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&config.default_writer);
    let writer = parse_writer_identity(writer_raw)?;
    let note_id = note_id_for_mesh_writer(id, &writer)?;
    let path = resolve_note_file_path(&config.vault, &note_id)?;
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => Ok(Json(
            json!({ "id": note_id, "content": content, "path": path.to_string_lossy() }),
        )
        .into_response()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Note not found", "id": note_id })),
        )
            .into_response()),
        Err(e) => Err(e.into()),
    }
}

pub struct WriteResult {
    pub id: String,
    pub path: PathBuf,
    pub content_hash: String,
    pub created: bool,
}

/// Write a note under the vault with writer-prefix enforcement. No Git.
/// The file is replaced atomically (temp file in the same directory + rename): the
/// Nuxt app may write to the same vault concurrently (ADR-020 §3).
pub async fn write_note_local(
    vault: &Path,
    id: &str,
    content: &str,
    writer: &str,
) -> Result<WriteResult, ApiError> {
    let writer = parse_writer_identity(writer)?;
    let note_id = note_id_for_mesh_writer(id, &writer)?;
    assert_note_id_writable_by_writer(&note_id, &writer)?;

    let path = resolve_note_file_path(vault, &note_id)?;
    let created = !tokio::fs::try_exists(&path).await?;
    let dir = path.parent().unwrap_or(vault);
    tokio::fs::create_dir_all(dir).await?;

    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!(".fluffmind-{}-{seq}.tmp", std::process::id()));
    let written = match tokio::fs::write(&tmp, content).await {
        Ok(()) => tokio::fs::rename(&tmp, &path).await,
        Err(e) => Err(e),
    };
    if let Err(e) = written {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e.into());
    }

    Ok(WriteResult {
        id: note_id,
        path,
        content_hash: format!("{:x}", Sha256::digest(content.as_bytes())),
        created,
    })
}
