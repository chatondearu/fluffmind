//! `--self-check`: the HTTP contract, replayed in-process against a temp vault.
//! The same assertions run over a real socket via `scripts/daemon-contract-smoke.mjs`.

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

use crate::server::{router, Config};

macro_rules! check {
    ($cond:expr, $($msg:tt)+) => {
        if !$cond {
            return Err(format!("self-check failed: {}", format!($($msg)+)));
        }
    };
}

async fn call(app: &Router, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(v) => {
            request = request.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

pub async fn run() -> Result<(), String> {
    let vault = tempfile::tempdir().map_err(|e| e.to_string())?;
    let app = router(Config {
        vault: vault.path().to_path_buf(),
        default_writer: "device:solo".into(),
        mesh: None,
        token: None,
    });

    let (status, health) = call(&app, Method::GET, "/health", None).await;
    check!(status == StatusCode::OK, "health HTTP {status}");
    check!(health["syncMode"] == "mesh-live", "health syncMode");

    let put = |content: &str| Some(json!({ "id": "smoke-http", "content": content }));
    let (status, created) = call(&app, Method::PUT, "/v1/notes", put("http-ok\n")).await;
    check!(status == StatusCode::CREATED, "PUT status {status}");
    check!(
        created["id"] == "writers/device/solo/smoke-http",
        "PUT id {}",
        created["id"]
    );
    check!(
        created["committed"] == false && created["pushed"] == false,
        "PUT must not touch Git"
    );
    let hash = format!("{:x}", Sha256::digest(b"http-ok\n"));
    check!(
        created["contentHash"] == hash.as_str(),
        "PUT contentHash {}",
        created["contentHash"]
    );
    let on_disk = std::fs::read_to_string(vault.path().join("writers/device/solo/smoke-http.md"));
    check!(
        on_disk.ok().as_deref() == Some("http-ok\n"),
        "file content mismatch"
    );

    let (status, updated) = call(&app, Method::PUT, "/v1/notes", put("v2\n")).await;
    check!(
        status == StatusCode::OK && updated["created"] == false,
        "update status {status}"
    );

    let (status, got) = call(&app, Method::GET, "/v1/notes?id=smoke-http", None).await;
    check!(status == StatusCode::OK, "GET HTTP {status}");
    check!(got["content"] == "v2\n", "GET content mismatch");

    let (status, _) = call(&app, Method::GET, "/v1/notes?id=missing", None).await;
    check!(
        status == StatusCode::NOT_FOUND,
        "GET missing status {status}"
    );

    let stolen =
        json!({ "id": "writers/user/alice/stolen", "content": "nope", "writer": "device:solo" });
    let (status, _) = call(&app, Method::PUT, "/v1/notes", Some(stolen)).await;
    check!(
        status == StatusCode::BAD_REQUEST,
        "prefix reject status {status}"
    );

    Ok(())
}
