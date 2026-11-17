//! HTTP contract of the portable daemon (ADR-020 §2): `GET /health`,
//! `PUT|GET /v1/notes`. Same routes, fields and status codes as the former Node daemon.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, Path as UrlPath, Query, Request, State};
use axum::http::{header, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::fsio::write_atomic;
use crate::mesh::{Mesh, MeshError};
use crate::writer::{
    assert_note_id_writable_by_writer, note_id_for_mesh_writer, parse_writer_identity,
    resolve_note_file_path, NoteError,
};

/// Notes are text; this only bounds a runaway client.
const BODY_LIMIT: usize = 16 * 1024 * 1024;

/// Local id of the `--vault` folder in the mesh registry.
pub const DEFAULT_VAULT_ID: &str = "default";

pub struct Config {
    pub vault: PathBuf,
    pub default_writer: String,
    /// The mesh peer (ADR-020); `None` serves the plain HTTP facade only.
    pub mesh: Option<Mesh>,
    /// Bearer token; `None` disables the gate (loopback only, enforced at startup).
    pub token: Option<String>,
}

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

impl From<MeshError> for ApiError {
    fn from(error: MeshError) -> Self {
        let status = match error {
            MeshError::Invalid(_) => StatusCode::BAD_REQUEST,
            MeshError::NotFound(_) => StatusCode::NOT_FOUND,
            MeshError::Refused(_) => StatusCode::FORBIDDEN,
            MeshError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self(status, error.to_string())
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
        .route("/v1/mesh", get(get_mesh))
        .route("/v1/mesh/changed", post(post_changed))
        .route("/v1/events", get(get_events))
        .route("/v1/vaults", get(list_vaults))
        .route("/v1/vaults/{id}", put(put_vault))
        .route("/v1/vaults/{id}/tickets", post(post_ticket))
        .route("/v1/vaults/{id}/enrol", post(post_enrol))
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

/// `Host` names a loopback address (port optional). Blocks DNS rebinding on the tokenless
/// loopback daemon: a rebound page still sends its own hostname.
fn is_loopback_host(host: &str) -> bool {
    let name = match host.rsplit_once(':') {
        Some((name, port)) if port.bytes().all(|b| b.is_ascii_digit()) => name,
        _ => host,
    };
    name.eq_ignore_ascii_case("localhost") || name == "127.0.0.1" || name == "[::1]"
}

/// Writes must be `application/json`: a cross-origin page can only send it after a CORS
/// preflight, which the daemon never grants (no-cors `text/plain` would otherwise pass).
fn is_json(request: &Request) -> bool {
    request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .is_some_and(|v| v.trim().eq_ignore_ascii_case("application/json"))
}

/// Bearer gate on every route except `/health`; without a token, loopback `Host` only.
/// Every write must be JSON.
async fn gate(State(config): State<Shared>, request: Request, next: Next) -> Response {
    if config.token.is_none() {
        // A missing Host is not a browser (they always send it), e.g. in-process tests.
        let host = request.headers().get(header::HOST);
        if host.is_some_and(|h| !h.to_str().is_ok_and(is_loopback_host)) {
            return ApiError(StatusCode::FORBIDDEN, "Forbidden host".into()).into_response();
        }
    }
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
    if !matches!(*request.method(), Method::GET | Method::HEAD) && !is_json(&request) {
        return ApiError(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Content-Type must be application/json".into(),
        )
        .into_response();
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
        "mesh": config.mesh.as_ref().map(Mesh::info),
    }))
}

/// Empty body = `{}`. Keeps the `{ error }` shape for the 413 raised by the body limit.
fn json_body(body: Result<Bytes, BytesRejection>) -> Result<Value, ApiError> {
    let body = body.map_err(|e| ApiError(e.status(), e.body_text()))?;
    if body.iter().all(u8::is_ascii_whitespace) {
        return Ok(json!({}));
    }
    serde_json::from_slice(&body).map_err(|_| ApiError::bad_request("Invalid JSON body"))
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
    let body = json_body(body)?;
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
    // The note is saved either way; a mesh hiccup only delays the announcement (the
    // interval pull still converges).
    if let Some(mesh) = &config.mesh {
        let path = format!("{}.md", result.id);
        match mesh
            .local_changed(DEFAULT_VAULT_ID, &path, writer, false, false)
            .await
        {
            Ok(_) | Err(MeshError::NotFound(_)) => {}
            Err(e) => eprintln!("[mesh] could not announce {path}: {e}"),
        }
    }
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
    write_atomic(&path, content.as_bytes()).await?;

    Ok(WriteResult {
        id: note_id,
        path,
        content_hash: format!("{:x}", Sha256::digest(content.as_bytes())),
        created,
    })
}

// ----- mesh routes (ADR-020 §2): all behind the bearer gate ---------------------------

fn mesh(config: &Config) -> Result<&Mesh, ApiError> {
    config.mesh.as_ref().ok_or(ApiError(
        StatusCode::SERVICE_UNAVAILABLE,
        "Mesh is not running".into(),
    ))
}

fn str_list(value: Option<&Value>, field: &str) -> Result<Option<Vec<String>>, ApiError> {
    let Some(value) = value.filter(|v| !v.is_null()) else {
        return Ok(None);
    };
    value
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .map(Some)
        .ok_or_else(|| ApiError::bad_request(&format!("\"{field}\" must be an array of strings")))
}

async fn get_mesh(State(config): State<Shared>) -> Result<Json<Value>, ApiError> {
    let mesh = mesh(&config)?;
    Ok(Json(
        json!({ "mesh": mesh.info(), "vaults": mesh.attached() }),
    ))
}

async fn list_vaults(State(config): State<Shared>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "vaults": mesh(&config)?.attached() })))
}

/// Nuxt pushes the vault config (Postgres stays the source of truth): `mesh-live`
/// (re)attaches, anything else detaches. A detach of an unknown vault is a no-op success.
async fn put_vault(
    State(config): State<Shared>,
    UrlPath(id): UrlPath<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, ApiError> {
    let mesh = mesh(&config)?;
    let body = json_body(body)?;
    match body.get("syncMode").and_then(Value::as_str) {
        Some("mesh-live") => {
            let Some(path) = non_blank_str(body.get("path")) else {
                return Err(ApiError::bad_request("Body must include string \"path\""));
            };
            let roots = str_list(body.get("contentRoots"), "contentRoots")?.unwrap_or_default();
            let info = mesh.attach(&id, Path::new(path), &roots).await?;
            Ok(Json(json!({
                "id": id, "syncMode": "mesh-live", "attached": true, "meshVault": info.mesh_vault,
            })))
        }
        Some("git-live") => {
            mesh.detach(&id).await?;
            Ok(Json(
                json!({ "id": id, "syncMode": "git-live", "attached": false, "meshVault": null }),
            ))
        }
        _ => Err(ApiError::bad_request(
            "\"syncMode\" must be \"mesh-live\" or \"git-live\"",
        )),
    }
}

/// Nuxt tells the daemon a vault file changed (hosted write, delete/rename, publish).
async fn post_changed(
    State(config): State<Shared>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, ApiError> {
    let mesh = mesh(&config)?;
    let body = json_body(body)?;
    let (Some(vault), Some(path), Some(writer)) = (
        non_blank_str(body.get("vault")),
        non_blank_str(body.get("path")),
        non_blank_str(body.get("writer")),
    ) else {
        return Err(ApiError::bad_request(
            "Body must include string \"vault\", \"path\" and \"writer\"",
        ));
    };
    let flag = |name: &str| body.get(name).and_then(Value::as_bool).unwrap_or(false);
    let changed = mesh
        .local_changed(
            vault,
            path,
            writer.trim(),
            flag("published"),
            flag("deleted"),
        )
        .await?;
    Ok(Json(json!({ "ok": true, "changed": changed })))
}

/// SSE: a remote update was persisted by the daemon (Nuxt invalidates its index).
async fn get_events(
    State(config): State<Shared>,
) -> Result<Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>>, ApiError>
{
    let events = BroadcastStream::new(mesh(&config)?.subscribe()).map(|event| {
        // A lagged receiver missed events: tell Nuxt to re-index everything.
        let data = match event {
            Ok(event) => serde_json::to_string(&event).unwrap_or_default(),
            Err(_) => json!({ "resync": true }).to_string(),
        };
        Ok(Event::default().data(data))
    });
    Ok(Sse::new(events).keep_alive(KeepAlive::default()))
}

async fn post_ticket(
    State(config): State<Shared>,
    UrlPath(id): UrlPath<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, ApiError> {
    let mesh = mesh(&config)?;
    let body = json_body(body)?;
    let writers = str_list(body.get("writers"), "writers")?.unwrap_or_default();
    let self_writers = str_list(body.get("selfWriters"), "selfWriters")?;
    let flag = |name: &str| body.get(name).and_then(Value::as_bool).unwrap_or(false);
    let ticket = mesh
        .issue_ticket(
            &id,
            &writers,
            flag("canPublish"),
            self_writers,
            flag("selfCanPublish"),
        )
        .await?;
    Ok(Json(json!({ "ticket": ticket })))
}

async fn post_enrol(
    State(config): State<Shared>,
    UrlPath(id): UrlPath<String>,
    body: Result<Bytes, BytesRejection>,
) -> Result<Json<Value>, ApiError> {
    let mesh = mesh(&config)?;
    let body = json_body(body)?;
    let Some(ticket) = non_blank_str(body.get("ticket")) else {
        return Err(ApiError::bad_request("Body must include string \"ticket\""));
    };
    let peer = mesh.enrol(&id, ticket).await?;
    Ok(Json(json!({
        "peer": peer,
        "meshVault": mesh.mesh_vault_id(&id).await,
    })))
}
