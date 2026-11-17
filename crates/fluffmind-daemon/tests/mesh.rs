//! Mesh peers (PLAN-151 T1–T5): in-process daemons syncing over real iroh endpoints.
//! Direct addresses only (no relay, no mDNS) except the T5 relay test.

use std::path::{Path, PathBuf};
use std::time::Duration;

use fluffmind_daemon::mesh::proto::{Reply, SyncReq, SYNC_ALPN};
use fluffmind_daemon::mesh::{Mesh, MeshError, MeshOptions};
use iroh::endpoint::presets;
use iroh::{Endpoint, EndpointAddr, RelayMode};

struct Node {
    mesh: Mesh,
    vault: PathBuf,
    data: PathBuf,
}

fn options(data: &Path, name: &str) -> MeshOptions {
    MeshOptions {
        data_dir: data.to_path_buf(),
        relay_url: None,
        direct_only: true,
        mdns: false,
        sync_interval: Duration::from_millis(500),
        default_writer: format!("device:{name}"),
        relay_ca_tls: None,
        relay_only: false,
    }
}

async fn node(root: &Path, name: &str) -> Node {
    node_with(root, name, |_| {}).await
}

async fn node_with(root: &Path, name: &str, tweak: impl FnOnce(&mut MeshOptions)) -> Node {
    let data = root.join(name).join("data");
    let vault = root.join(name).join("vault");
    let mut opts = options(&data, name);
    tweak(&mut opts);
    let mesh = Mesh::start(opts).await.expect("mesh start");
    mesh.attach("v", &vault, &[]).await.expect("attach");
    Node { mesh, vault, data }
}

impl Node {
    fn file(&self, path: &str) -> PathBuf {
        self.vault.join(path)
    }

    async fn write(&self, path: &str, content: &str) {
        let file = self.file(path);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, content).unwrap();
    }
}

/// `host` issues a ticket and `peer` redeems it. `host_writers` = what `peer` may author on
/// `host`; the host asks for `host_publishes` on the peer's side.
async fn enrol(
    host: &Node,
    peer: &Node,
    writers: &[&str],
    can_publish: bool,
    host_publishes: bool,
) {
    let writers: Vec<String> = writers.iter().map(|w| w.to_string()).collect();
    let ticket = host
        .mesh
        .issue_ticket("v", &writers, can_publish, None, host_publishes)
        .await
        .unwrap();
    peer.mesh.enrol("v", &ticket).await.unwrap();
}

async fn eventually(what: &str, mut check: impl FnMut() -> bool) {
    for _ in 0..200 {
        if check() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("timed out waiting for: {what}");
}

fn read(path: PathBuf) -> impl FnMut() -> Option<String> {
    move || std::fs::read_to_string(&path).ok()
}

/// What a stranger (random key, not in any allow-list) sees on the sync ALPN.
async fn raw_sync_call(addr: EndpointAddr, request: &SyncReq) -> Reply {
    let endpoint = Endpoint::builder(presets::Minimal)
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await
        .unwrap();
    let conn = endpoint.connect(addr, SYNC_ALPN).await.unwrap();
    let (mut send, mut recv) = conn.open_bi().await.unwrap();
    send.write_all(&serde_json::to_vec(request).unwrap())
        .await
        .unwrap();
    send.finish().unwrap();
    let raw = recv.read_to_end(1 << 20).await.unwrap();
    conn.close(0u32.into(), b"done");
    serde_json::from_slice(&raw).unwrap()
}

async fn announce(node: &Node, path: &str, writer: &str) {
    node.mesh
        .local_changed("v", path, writer, false, false)
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t1_two_daemons_sync_a_file_direct() {
    let dir = tempfile::tempdir().unwrap();
    let a = node(dir.path(), "a").await;
    let b = node(dir.path(), "b").await;
    enrol(&a, &b, &["device:b"], false, false).await;
    let mut events = b.mesh.subscribe();

    a.write("writers/device/a/hello.md", "from a").await;
    announce(&a, "writers/device/a/hello.md", "device:a").await;
    let mut got = read(b.file("writers/device/a/hello.md"));
    eventually("a's note lands on b", || got().as_deref() == Some("from a")).await;

    // The daemon tells Nuxt a remote update was persisted (ADR-019 invalidate).
    let event = tokio::time::timeout(Duration::from_secs(5), events.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(event.path, "writers/device/a/hello.md");
    assert!(event.persisted && !event.deleted);

    // And the other way round.
    b.write("writers/device/b/reply.md", "from b").await;
    announce(&b, "writers/device/b/reply.md", "device:b").await;
    let mut got = read(a.file("writers/device/b/reply.md"));
    eventually("b's note lands on a", || got().as_deref() == Some("from b")).await;

    // The applied file carries the entry's mtime, so disk LWW agrees with the mesh.
    let applied = std::fs::metadata(b.file("writers/device/a/hello.md"))
        .unwrap()
        .modified()
        .unwrap();
    let origin = std::fs::metadata(a.file("writers/device/a/hello.md"))
        .unwrap()
        .modified()
        .unwrap();
    let skew = applied
        .max(origin)
        .duration_since(applied.min(origin))
        .unwrap();
    assert!(
        skew < Duration::from_secs(1),
        "mtime preserved, got skew {skew:?}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t2_enrol_refuses_replay_strangers_and_bad_codes() {
    let dir = tempfile::tempdir().unwrap();
    let a = node(dir.path(), "a").await;
    let b = node(dir.path(), "b").await;
    let stranger = node(dir.path(), "s").await;

    let ticket = a
        .mesh
        .issue_ticket("v", &["device:b".to_string()], false, None, false)
        .await
        .unwrap();
    b.mesh.enrol("v", &ticket).await.unwrap();

    // Single use: replaying the ticket is refused, opaquely.
    let replay = stranger.mesh.enrol("v", &ticket).await.unwrap_err();
    assert!(
        matches!(&replay, MeshError::Refused(m) if m == "enrol refused"),
        "{replay:?}"
    );

    // Garbage and expired tickets never reach the network.
    assert!(matches!(
        b.mesh.enrol("v", "nope").await,
        Err(MeshError::Invalid(_))
    ));

    // A stranger knows the vault id but is not in the allow-list: every sync call is refused.
    let mesh_vault = a.mesh.mesh_vault_id("v").await.unwrap();
    for request in [
        SyncReq::Manifest {
            vault: mesh_vault.clone(),
        },
        SyncReq::Fetch {
            vault: mesh_vault.clone(),
            paths: vec!["writers/device/a/x.md".into()],
        },
        SyncReq::Changed { vault: mesh_vault },
    ] {
        let reply = raw_sync_call(a.mesh.addr(), &request).await;
        assert!(
            !reply.ok && reply.entries.is_none() && reply.blobs.is_none(),
            "{reply:?}"
        );
        assert_eq!(reply.error.as_deref(), Some("refused"));
    }
    // An unknown vault id looks exactly the same (no oracle).
    let unknown = raw_sync_call(
        a.mesh.addr(),
        &SyncReq::Manifest {
            vault: "00".repeat(32),
        },
    )
    .await;
    assert_eq!(unknown.error.as_deref(), Some("refused"));
    let _ = stranger;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t2_redeem_is_rate_limited_per_source() {
    let dir = tempfile::tempdir().unwrap();
    let a = node(dir.path(), "a").await;
    let guesser = node(dir.path(), "g").await;
    let ticket = a
        .mesh
        .issue_ticket("v", &["device:g".to_string()], false, None, false)
        .await
        .unwrap();
    // Same ticket, wrong code: forged by re-encoding with another code.
    let forged = {
        let mut t = fluffmind_daemon::mesh::ticket::Ticket::decode(&ticket).unwrap();
        t.code = "WRONGCODE000".into();
        t.encode()
    };
    for _ in 0..fluffmind_daemon::mesh::ticket::REDEEM_PER_SOURCE {
        assert!(guesser.mesh.enrol("v", &forged).await.is_err());
    }
    // The real code is now locked out for this source too.
    assert!(matches!(
        guesser.mesh.enrol("v", &ticket).await,
        Err(MeshError::Refused(_))
    ));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t3_receiver_rejects_unauthorised_entries() {
    let dir = tempfile::tempdir().unwrap();
    let host = node(dir.path(), "host").await;
    let rogue = node(dir.path(), "rogue").await;
    // `rogue` may author only device:rogue and cannot publish.
    enrol(&host, &rogue, &["device:rogue"], false, false).await;

    // 1. Another writer's prefix, 2. a self-asserted canonical publish.
    rogue.write("writers/device/other/x.md", "spoof").await;
    announce(&rogue, "writers/device/other/x.md", "device:other").await;
    rogue.write("notes/x.md", "canonical").await;
    rogue
        .mesh
        .local_changed("v", "notes/x.md", "device:rogue", true, false)
        .await
        .unwrap();
    // 3. The one legitimate write, so we know the pull ran.
    rogue.write("writers/device/rogue/ok.md", "fine").await;
    announce(&rogue, "writers/device/rogue/ok.md", "device:rogue").await;

    let mut ok = read(host.file("writers/device/rogue/ok.md"));
    eventually("legit write lands", || ok().as_deref() == Some("fine")).await;
    assert!(
        !host.file("writers/device/other/x.md").exists(),
        "wrong writer prefix"
    );
    assert!(
        !host.file("notes/x.md").exists(),
        "publish without canPublish"
    );

    // An ordinary save can never be canonical: the local side refuses an unpublished root.
    let err = rogue
        .mesh
        .local_changed("v", "notes/x.md", "device:rogue", false, false)
        .await
        .unwrap_err();
    assert!(matches!(err, MeshError::Invalid(_)));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t3_publish_needs_the_grant_and_forwarding_keeps_the_origin_check() {
    let dir = tempfile::tempdir().unwrap();
    let hub = node(dir.path(), "hub").await;
    let b = node(dir.path(), "b").await;
    let c = node(dir.path(), "c").await;
    // hub trusts b to publish; c trusts hub and b, but never granted b canPublish.
    enrol(&hub, &b, &["device:b"], true, false).await;
    enrol(&hub, &c, &["device:c"], false, false).await;
    enrol(&b, &c, &["device:c"], false, false).await;

    // c is offline while b writes, and b is gone before c returns: the only source left
    // is the hub, which forwards entries signed by b.
    let (c_data, c_vault) = (c.data.clone(), c.vault.clone());
    c.mesh.shutdown().await;
    b.write("writers/device/b/draft.md", "draft").await;
    announce(&b, "writers/device/b/draft.md", "device:b").await;
    b.write("notes/pub.md", "published").await;
    b.mesh
        .local_changed("v", "notes/pub.md", "device:b", true, false)
        .await
        .unwrap();
    let mut at_hub = read(hub.file("notes/pub.md"));
    eventually("publish lands on the hub (grant held)", || {
        at_hub().as_deref() == Some("published")
    })
    .await;
    let mut draft_at_hub = read(hub.file("writers/device/b/draft.md"));
    eventually("draft lands on the hub", || {
        draft_at_hub().as_deref() == Some("draft")
    })
    .await;
    b.mesh.shutdown().await;

    let mesh = Mesh::start(options(&c_data, "c")).await.unwrap();
    let c = Node {
        mesh,
        vault: c_vault,
        data: c_data,
    };
    let mut at_c = read(c.file("writers/device/b/draft.md"));
    eventually("b's draft reaches c via the hub", || {
        at_c().as_deref() == Some("draft")
    })
    .await;
    // The forwarded *published* entry is refused: the origin check uses c's grant for b.
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert!(
        !c.file("notes/pub.md").exists(),
        "c has no canPublish grant for b"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t4_offline_peer_catches_up_with_writes_deletes_and_publish_renames() {
    let dir = tempfile::tempdir().unwrap();
    let a = node(dir.path(), "a").await;
    let b = node(dir.path(), "b").await;
    // a is the host: it publishes, and b grants it canPublish.
    enrol(&a, &b, &["device:b"], false, true).await;

    a.write("writers/user/u/draft.md", "v1").await;
    announce(&a, "writers/user/u/draft.md", "user:u").await;
    let mut at_b = read(b.file("writers/user/u/draft.md"));
    eventually("draft synced", || at_b().as_deref() == Some("v1")).await;

    let b_data = b.data.clone();
    b.mesh.shutdown().await;

    // Offline: a write, a delete (draft rename on publish = tombstone + canonical entry).
    a.write("writers/user/u/other.md", "while offline").await;
    announce(&a, "writers/user/u/other.md", "user:u").await;
    std::fs::remove_file(a.file("writers/user/u/draft.md")).unwrap();
    a.mesh
        .local_changed("v", "writers/user/u/draft.md", "user:u", false, true)
        .await
        .unwrap();
    a.write("notes/draft.md", "v1").await;
    a.mesh
        .local_changed("v", "notes/draft.md", "user:u", true, false)
        .await
        .unwrap();

    // b comes back: state and allow-list were persisted, startup pulls from a.
    let mesh = Mesh::start(options(&b_data, "b")).await.unwrap();
    let b = Node { mesh, ..b };
    let mut other = read(b.file("writers/user/u/other.md"));
    eventually("offline write caught up", || {
        other().as_deref() == Some("while offline")
    })
    .await;
    let mut published = read(b.file("notes/draft.md"));
    eventually("canonical published file caught up", || {
        published().as_deref() == Some("v1")
    })
    .await;
    eventually("tombstone removed the draft", || {
        !b.file("writers/user/u/draft.md").exists()
    })
    .await;

    // A newer write wins over the older tombstone, on every peer.
    a.write("writers/user/u/draft.md", "v2").await;
    announce(&a, "writers/user/u/draft.md", "user:u").await;
    let mut revived = read(b.file("writers/user/u/draft.md"));
    eventually("newer write beats the tombstone", || {
        revived().as_deref() == Some("v2")
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn t5_peers_sync_through_a_relay_with_direct_addresses_disabled() {
    let (_map, relay_url, _server) = iroh::test_utils::run_relay_server().await.unwrap();
    let dir = tempfile::tempdir().unwrap();
    let relay = |o: &mut MeshOptions| {
        o.direct_only = false;
        o.relay_url = Some(relay_url.to_string());
        o.relay_ca_tls = Some(iroh::tls::CaTlsConfig::insecure_skip_verify());
        o.relay_only = true;
    };
    let a = node_with(dir.path(), "a", relay).await;
    let b = node_with(dir.path(), "b", relay).await;
    enrol(&a, &b, &["device:b"], false, false).await;

    a.write("writers/device/a/relayed.md", "over the relay")
        .await;
    announce(&a, "writers/device/a/relayed.md", "device:a").await;
    let mut got = read(b.file("writers/device/a/relayed.md"));
    eventually("note relayed", || {
        got().as_deref() == Some("over the relay")
    })
    .await;
    assert!(
        b.mesh.info().relay_home.is_some(),
        "endpoint is homed on the relay"
    );
}
