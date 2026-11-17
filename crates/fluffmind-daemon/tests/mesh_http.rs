//! Daemon HTTP surface for the mesh (PLAN-151 T6): vault config push, `changed`
//! notifications, SSE events, ticket routes and the bearer gate — over real iroh peers.

use std::path::{Path, PathBuf};
use std::time::Duration;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use fluffmind_daemon::mesh::{Mesh, MeshOptions};
use fluffmind_daemon::server::{router, Config};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

struct Daemon {
    app: Router,
    mesh: Mesh,
    vault: PathBuf,
}

async fn daemon(root: &Path, name: &str, token: Option<&str>) -> Daemon {
    let vault = root.join(name).join("vault");
    std::fs::create_dir_all(&vault).unwrap();
    let mesh = Mesh::start(MeshOptions {
        data_dir: root.join(name).join("data"),
        relay_url: None,
        direct_only: true,
        mdns: false,
        sync_interval: Duration::from_millis(500),
        default_writer: format!("device:{name}"),
        relay_ca_tls: None,
        relay_only: false,
    })
    .await
    .unwrap();
    let app = router(Config {
        vault: vault.clone(),
        default_writer: format!("device:{name}"),
        mesh: Some(mesh.clone()),
        token: token.map(Into::into),
    });
    Daemon { app, mesh, vault }
}

async fn send_raw(
    app: &Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> axum::response::Response {
    let mut request = Request::builder().method(method.clone()).uri(uri);
    if method != Method::GET {
        request = request.header(header::CONTENT_TYPE, "application/json");
    }
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let body = body.map_or_else(Body::empty, |b| Body::from(b.to_string()));
    app.clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap()
}

async fn send(
    app: &Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let response = send_raw(app, method, uri, token, body).await;
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn attach(d: &Daemon, id: &str, token: Option<&str>) {
    let (status, body) = send(
        &d.app,
        Method::PUT,
        &format!("/v1/vaults/{id}"),
        token,
        Some(json!({ "syncMode": "mesh-live", "contentRoots": [], "path": d.vault })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["attached"], true);
}

async fn eventually(what: &str, mut check: impl FnMut() -> bool) {
    for _ in 0..100 {
        if check() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("timed out waiting for: {what}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn config_push_changed_events_and_flip_back_to_git_live() {
    let dir = tempfile::tempdir().unwrap();
    let a = daemon(dir.path(), "a", None).await;
    let b = daemon(dir.path(), "b", None).await;
    attach(&a, "ws", None).await;
    attach(&b, "ws", None).await;

    // Bad config is a 400, not a panic; a git-live push for an unknown vault is a no-op 200
    // (Nuxt sends it at boot in auth-off mode).
    let put = |body| send(&a.app, Method::PUT, "/v1/vaults/ws", None, Some(body));
    assert_eq!(
        put(json!({ "syncMode": "weird" })).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        put(json!({ "syncMode": "mesh-live" })).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        put(json!({ "syncMode": "mesh-live", "path": "relative" }))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let (status, body) = send(
        &a.app,
        Method::PUT,
        "/v1/vaults/never-seen",
        None,
        Some(json!({ "syncMode": "git-live" })),
    )
    .await;
    assert_eq!((status, &body["attached"]), (StatusCode::OK, &json!(false)));

    // Enrol b into a through the HTTP routes.
    let (status, ticket) = send(
        &a.app,
        Method::POST,
        "/v1/vaults/ws/tickets",
        None,
        Some(json!({ "writers": ["device:b"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = send(
        &b.app,
        Method::POST,
        "/v1/vaults/ws/enrol",
        None,
        Some(json!({ "ticket": ticket["ticket"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["peer"], a.mesh.endpoint_id());

    // Nuxt wrote a file on a and says so: it lands on b, and b's SSE stream reports it.
    let events = send_raw(&b.app, Method::GET, "/v1/events", None, None).await;
    assert_eq!(events.status(), StatusCode::OK);
    let mut stream = events.into_body();
    let note = "writers/device/a/http.md";
    std::fs::create_dir_all(a.vault.join("writers/device/a")).unwrap();
    std::fs::write(a.vault.join(note), "hello").unwrap();
    let changed = json!({ "vault": "ws", "path": note, "writer": "device:a", "published": false, "deleted": false });
    let (status, body) = send(
        &a.app,
        Method::POST,
        "/v1/mesh/changed",
        None,
        Some(changed.clone()),
    )
    .await;
    assert_eq!((status, &body["changed"]), (StatusCode::OK, &json!(true)));
    let (_, again) = send(
        &a.app,
        Method::POST,
        "/v1/mesh/changed",
        None,
        Some(changed),
    )
    .await;
    assert_eq!(
        again["changed"], false,
        "an unchanged manifest is not re-announced"
    );

    let frame = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let frame = stream.frame().await.unwrap().unwrap();
            if let Some(data) = frame.data_ref().filter(|d| d.starts_with(b"data:")) {
                return String::from_utf8_lossy(data).to_string();
            }
        }
    })
    .await
    .expect("SSE event");
    let event: Value =
        serde_json::from_str(frame.trim().trim_start_matches("data:").trim()).unwrap();
    assert_eq!(event["vault"], "ws");
    assert_eq!(event["path"], note);
    assert_eq!(
        (event["deleted"].clone(), event["persisted"].clone()),
        (json!(false), json!(true))
    );
    assert_eq!(
        std::fs::read_to_string(b.vault.join(note)).unwrap(),
        "hello"
    );

    // Unknown vault / bad input on `changed`.
    let (status, _) = send(
        &a.app,
        Method::POST,
        "/v1/mesh/changed",
        None,
        Some(json!({ "vault": "nope", "path": note, "writer": "device:a" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = send(
        &a.app,
        Method::POST,
        "/v1/mesh/changed",
        None,
        Some(json!({ "vault": "ws" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // b flips to git-live: it detaches and stops syncing...
    let (_, flipped) = send(
        &b.app,
        Method::PUT,
        "/v1/vaults/ws",
        None,
        Some(json!({ "syncMode": "git-live" })),
    )
    .await;
    assert_eq!(flipped["attached"], false);
    let later = "writers/device/a/later.md";
    std::fs::write(a.vault.join(later), "after the flip").unwrap();
    let body = json!({ "vault": "ws", "path": later, "writer": "device:a", "published": false, "deleted": false });
    send(&a.app, Method::POST, "/v1/mesh/changed", None, Some(body)).await;
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert!(
        !b.vault.join(later).exists(),
        "a detached vault must not sync"
    );
    let (status, _) = send(
        &b.app,
        Method::POST,
        "/v1/mesh/changed",
        None,
        Some(json!({ "vault": "ws", "path": note, "writer": "device:a" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // ...and flipping back catches up (state, allow-list and mesh id survived the detach).
    attach(&b, "ws", None).await;
    eventually("re-attached vault catches up", || {
        b.vault.join(later).exists()
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn put_notes_announces_to_peers_and_routes_need_the_token() {
    let dir = tempfile::tempdir().unwrap();
    let a = daemon(dir.path(), "a", Some("s3cret")).await;
    let b = daemon(dir.path(), "b", None).await;
    // The `--vault` folder is mesh vault "default" (what main.rs attaches).
    attach(&a, "default", Some("s3cret")).await;
    attach(&b, "default", None).await;

    for (method, uri) in [
        (Method::GET, "/v1/mesh"),
        (Method::GET, "/v1/events"),
        (Method::GET, "/v1/vaults"),
        (Method::PUT, "/v1/vaults/x"),
        (Method::POST, "/v1/mesh/changed"),
        (Method::POST, "/v1/vaults/default/tickets"),
        (Method::POST, "/v1/vaults/default/enrol"),
    ] {
        let (status, _) = send(&a.app, method.clone(), uri, None, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{method} {uri}");
        let (status, _) = send(&a.app, method, uri, Some("wrong"), None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    // With a token, /health stays minimal: no endpoint id or vault path.
    let (_, health) = send(&a.app, Method::GET, "/health", None, None).await;
    assert_eq!(health, json!({ "ok": true }));

    let (_, ticket) = send(
        &a.app,
        Method::POST,
        "/v1/vaults/default/tickets",
        Some("s3cret"),
        Some(json!({ "writers": ["device:b"] })),
    )
    .await;
    let (status, _) = send(
        &b.app,
        Method::POST,
        "/v1/vaults/default/enrol",
        None,
        Some(json!({ "ticket": ticket["ticket"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // A plain `PUT /v1/notes` (portable UI) on a lands on b with no explicit `changed` call.
    let (status, body) = send(
        &a.app,
        Method::PUT,
        "/v1/notes",
        Some("s3cret"),
        Some(json!({ "id": "idea", "content": "hi" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    eventually("PUT /v1/notes reaches the peer", || {
        std::fs::read_to_string(b.vault.join("writers/device/a/idea.md")).is_ok_and(|c| c == "hi")
    })
    .await;

    let (_, info) = send(&b.app, Method::GET, "/v1/mesh", None, None).await;
    assert_eq!(info["mesh"]["endpointId"], b.mesh.endpoint_id());
}

#[tokio::test]
async fn mesh_routes_answer_503_when_the_mesh_is_off() {
    let vault = tempfile::tempdir().unwrap();
    let app = router(Config {
        vault: vault.path().to_path_buf(),
        default_writer: "device:solo".into(),
        mesh: None,
        token: None,
    });
    let (status, _) = send(&app, Method::GET, "/v1/mesh", None, None).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
}
