//! Seams 2–3: HTTP contract (black-box over a temp vault) and the token gate.

use std::process::Command;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use fluffmind_daemon::server::{router, Config};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn app(vault: &std::path::Path, token: Option<&str>) -> Router {
    router(Config {
        vault: vault.to_path_buf(),
        default_writer: "device:solo".into(),
        token: token.map(Into::into),
    })
}

async fn send(
    app: &Router,
    method: Method,
    uri: &str,
    bearer: Option<&str>,
    body: Option<&str>,
) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(uri);
    if let Some(token) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(
            request
                .body(body.map_or_else(Body::empty, |b| Body::from(b.to_owned())))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn self_check_passes() {
    fluffmind_daemon::self_check::run().await.unwrap();
}

#[tokio::test]
async fn health_reports_vault_without_token() {
    let vault = tempfile::tempdir().unwrap();
    let (status, body) = send(&app(vault.path(), None), Method::GET, "/health", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["syncMode"], "mesh-live");
    assert_eq!(body["defaultWriter"], "device:solo");
    assert!(body["vaultPath"].is_string());
}

#[tokio::test]
async fn put_validates_the_body() {
    let vault = tempfile::tempdir().unwrap();
    let app = app(vault.path(), None);
    for (body, message) in [
        ("{not json", "Invalid JSON body"),
        ("", "Body must include string \"id\""),
        (
            "{\"id\":\"  \",\"content\":\"x\"}",
            "Body must include string \"id\"",
        ),
        ("{\"id\":\"a\"}", "Body must include string \"content\""),
        (
            "{\"id\":\"a\",\"content\":\"x\",\"writer\":\"nope\"}",
            "Writer identity must look like kind:id",
        ),
        (
            "{\"id\":\"../a\",\"content\":\"x\"}",
            "Note id must not contain \".\" or \"..\" segments",
        ),
    ] {
        let (status, got) = send(&app, Method::PUT, "/v1/notes", None, Some(body)).await;
        assert_eq!(
            (status, got["error"].as_str()),
            (StatusCode::BAD_REQUEST, Some(message)),
            "{body}"
        );
    }
}

#[tokio::test]
async fn put_then_get_uses_the_requested_writer() {
    let vault = tempfile::tempdir().unwrap();
    let app = app(vault.path(), None);
    let body = json!({ "id": "ideas", "content": "hi", "writer": "user:alice" }).to_string();
    let (status, put) = send(&app, Method::PUT, "/v1/notes", None, Some(&body)).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(put["id"], "writers/user/alice/ideas");

    let (status, got) = send(
        &app,
        Method::GET,
        "/v1/notes?id=ideas&writer=user:alice",
        None,
        None,
    )
    .await;
    assert_eq!(
        (status, got["content"].as_str()),
        (StatusCode::OK, Some("hi"))
    );
    // The default writer (device:solo) has no such draft.
    let (status, _) = send(&app, Method::GET, "/v1/notes?id=ideas", None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = send(&app, Method::GET, "/v1/notes", None, None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unknown_routes_and_methods_are_404() {
    let vault = tempfile::tempdir().unwrap();
    let app = app(vault.path(), None);
    for (method, uri) in [
        (Method::GET, "/nope"),
        (Method::POST, "/v1/notes"),
        (Method::PUT, "/health"),
    ] {
        let (status, body) = send(&app, method, uri, None, None).await;
        assert_eq!(
            (status, body["error"].as_str()),
            (StatusCode::NOT_FOUND, Some("Not found"))
        );
    }
}

#[tokio::test]
async fn token_gate_guards_every_route_but_health() {
    let vault = tempfile::tempdir().unwrap();
    let app = app(vault.path(), Some("s3cret"));

    let (status, health) = send(&app, Method::GET, "/health", None, None).await;
    assert_eq!((status, health), (StatusCode::OK, json!({ "ok": true })));

    for bearer in [None, Some("wrong"), Some("s3cre"), Some("s3cret!")] {
        let (status, _) = send(&app, Method::GET, "/v1/notes?id=a", bearer, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{bearer:?}");
    }
    let (status, _) = send(&app, Method::PUT, "/v1/notes", None, Some("{}")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = send(&app, Method::GET, "/nope", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let body = json!({ "id": "a", "content": "x" }).to_string();
    let (status, _) = send(&app, Method::PUT, "/v1/notes", Some("s3cret"), Some(&body)).await;
    assert_eq!(status, StatusCode::CREATED);

    // RFC 9110: the auth scheme is case-insensitive.
    let request = Request::builder()
        .uri("/v1/notes?id=a")
        .header(header::AUTHORIZATION, "bearer s3cret")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn oversized_body_is_413_with_error_json() {
    let vault = tempfile::tempdir().unwrap();
    let body = json!({ "id": "a", "content": "x".repeat(17 * 1024 * 1024) }).to_string();
    let (status, body) = send(
        &app(vault.path(), None),
        Method::PUT,
        "/v1/notes",
        None,
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(body["error"].is_string(), "{body}");
}

#[tokio::test]
async fn failed_write_leaves_no_temp_file() {
    let vault = tempfile::tempdir().unwrap();
    // The target path is a directory, so the rename fails after the temp file is written.
    let dir = vault.path().join("writers/device/solo/a.md");
    std::fs::create_dir_all(&dir).unwrap();
    let body = json!({ "id": "a", "content": "x" }).to_string();
    let (status, _) = send(
        &app(vault.path(), None),
        Method::PUT,
        "/v1/notes",
        None,
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    let leftovers = std::fs::read_dir(dir.parent().unwrap())
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")
        })
        .count();
    assert_eq!(leftovers, 0);
}

#[test]
fn startup_refuses_non_loopback_without_token() {
    let vault = tempfile::tempdir().unwrap();
    let run = |host: &str, token: Option<&str>| {
        let mut cmd = Command::new(env!("CARGO_BIN_EXE_fluffmind-daemon"));
        // --port 1 would need root: the refusal must come before any bind attempt.
        cmd.args([
            "--vault",
            vault.path().to_str().unwrap(),
            "--host",
            host,
            "--port",
            "1",
        ]);
        cmd.env_remove("FLUFFMIND_DAEMON_TOKEN");
        if let Some(token) = token {
            cmd.env("FLUFFMIND_DAEMON_TOKEN", token);
        }
        cmd.output().unwrap()
    };

    for token in [None, Some("  ")] {
        let out = run("0.0.0.0", token);
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stderr).contains("Refusing to bind 0.0.0.0"));
    }
}
