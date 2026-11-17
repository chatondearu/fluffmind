//! Mesh peer (ADR-020): iroh endpoint, enrolment and notify-then-pull sync of whole files
//! between daemons. Nuxt never links iroh — it talks to the HTTP facade in `server.rs`.
//!
//! Layout: `entry` (signed entries, policy) · `vault` (persisted state) · `ticket`
//! (enrolment codes) · `proto` (wire types) · this file (endpoint, handlers, sync).

pub mod entry;
pub mod proto;
pub mod ticket;
pub mod vault;

use std::collections::HashMap;
use std::fmt;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, Mutex as StdMutex, RwLock, Weak};
use std::time::Duration;

use data_encoding::BASE64;
use iroh::endpoint::{presets, Connection};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayMap, RelayMode, RelayUrl, SecretKey};
use serde::Serialize;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use crate::fsio::{mtime_ms, set_mtime_ms, write_atomic};
use crate::writer::{parse_writer_identity, resolve_note_file_path};
use entry::{check_policy, check_remote, Entry, Grant};
use proto::{
    Blob, EnrolReply, EnrolReq, Reply, SyncReq, ENROL_ALPN, FETCH_BATCH, FETCH_BUDGET, MAX_REPLY,
    MAX_REQUEST, SYNC_ALPN,
};
use ticket::{now_secs, Pending, Pendings, RedeemLimiter, Ticket, REFUSED, TICKET_TTL_SECS};
use vault::{normalize_content_roots, random_hex32, valid_local_id, Vault, VaultData};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const ENROL_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug)]
pub enum MeshError {
    Invalid(String),
    NotFound(String),
    Refused(String),
    Internal(String),
}

impl fmt::Display for MeshError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (Self::Invalid(m) | Self::NotFound(m) | Self::Refused(m) | Self::Internal(m)) = self;
        f.write_str(m)
    }
}

impl From<std::io::Error> for MeshError {
    fn from(error: std::io::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

type MeshResult<T> = Result<T, MeshError>;

fn invalid<T>(message: impl Into<String>) -> MeshResult<T> {
    Err(MeshError::Invalid(message.into()))
}

fn internal(message: impl ToString) -> MeshError {
    MeshError::Internal(message.to_string())
}

pub struct MeshOptions {
    /// Holds `node.key` (0600) and `vaults/*.json`.
    pub data_dir: PathBuf,
    /// Self-hosted `iroh-relay` (`FLUFFMIND_RELAY_URL`); `None` falls back to the n0 public
    /// relays, a development convenience only (ADR-020 §8).
    pub relay_url: Option<String>,
    /// `FLUFFMIND_MESH_DIRECT=1`: no relay at all (LAN / tests).
    pub direct_only: bool,
    /// LAN discovery. Non-fatal when the platform refuses multicast.
    pub mdns: bool,
    /// Fallback pull of every peer: covers lost `Changed` notifications and peers that were
    /// offline when a change happened.
    pub sync_interval: Duration,
    /// Writer identity of this daemon, offered by default in tickets it issues.
    pub default_writer: String,
    /// TLS trust for the relay (default: iroh's own roots). A private-CA relay, or the
    /// self-signed relay of the T5 test, passes its roots here.
    pub relay_ca_tls: Option<iroh::tls::CaTlsConfig>,
    /// Tests only: drop the IP transports so every byte goes through the relay (T5).
    #[doc(hidden)]
    pub relay_only: bool,
}

/// A remote update that landed on disk (what `GET /v1/events` streams to Nuxt).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshEvent {
    pub vault: String,
    pub path: String,
    pub mtime_ms: u64,
    pub deleted: bool,
    pub persisted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachInfo {
    pub mesh_vault: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshInfo {
    pub endpoint_id: String,
    /// Relay this daemon was told to use (`None` = n0 default / direct).
    pub relay_configured: Option<String>,
    /// Relay the endpoint is currently homed on (`None` = not connected).
    pub relay_home: Option<String>,
    pub direct_only: bool,
}

struct Inner {
    endpoint: Endpoint,
    secret: SecretKey,
    options: MeshOptions,
    relay: Option<RelayUrl>,
    /// Attached (mesh-live) vaults by local id.
    vaults: RwLock<HashMap<String, Arc<Vault>>>,
    events: broadcast::Sender<MeshEvent>,
    pendings: StdMutex<Pendings>,
    limiter: StdMutex<RedeemLimiter>,
    /// Last manifest digest pulled per (mesh vault, peer): pull only when it differs.
    digests: StdMutex<HashMap<(String, String), String>>,
    router: StdMutex<Option<Router>>,
    tasks: StdMutex<Vec<JoinHandle<()>>>,
}

#[derive(Clone)]
pub struct Mesh {
    inner: Arc<Inner>,
}

macro_rules! warn {
    ($($arg:tt)*) => { eprintln!("[mesh] {}", format_args!($($arg)*)) };
}

/// Load the ed25519 key (= `EndpointId`) or create it with mode 0600.
fn load_or_create_key(path: &Path) -> Result<SecretKey, String> {
    use std::io::Write;
    if let Ok(bytes) = std::fs::read(path) {
        let bytes: [u8; 32] = bytes
            .try_into()
            .map_err(|_| format!("{} must hold exactly 32 bytes", path.display()))?;
        return Ok(SecretKey::from_bytes(&bytes));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let key = SecretKey::generate();
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(&key.to_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(key)
}

impl Mesh {
    pub async fn start(options: MeshOptions) -> Result<Self, String> {
        let secret = load_or_create_key(&options.data_dir.join("node.key"))?;
        let relay = match (&options.relay_url, options.direct_only) {
            (Some(url), false) => Some(
                url.parse::<RelayUrl>()
                    .map_err(|e| format!("FLUFFMIND_RELAY_URL: {e}"))?,
            ),
            _ => None,
        };

        let builder = if options.direct_only {
            Endpoint::builder(presets::Minimal).relay_mode(RelayMode::Disabled)
        } else if let Some(url) = &relay {
            Endpoint::builder(presets::Minimal)
                .relay_mode(RelayMode::Custom(RelayMap::from(url.clone())))
        } else {
            Endpoint::builder(presets::N0)
        };
        let mut builder = builder;
        if let Some(ca) = options.relay_ca_tls.clone() {
            builder = builder.ca_tls_config(ca);
        }
        if options.relay_only {
            builder = builder.clear_ip_transports();
        }
        let endpoint = builder
            .secret_key(secret.clone())
            .bind()
            .await
            .map_err(|e| format!("Cannot bind iroh endpoint: {e}"))?;

        if options.mdns {
            match iroh_mdns_address_lookup::MdnsAddressLookup::builder().build(endpoint.id()) {
                Ok(mdns) => {
                    if let Ok(lookup) = endpoint.address_lookup() {
                        lookup.add(mdns);
                    }
                }
                Err(e) => warn!("mDNS disabled: {e}"),
            }
        }

        let (events, _) = broadcast::channel(256);
        let inner = Arc::new(Inner {
            endpoint: endpoint.clone(),
            secret,
            options,
            relay,
            vaults: RwLock::default(),
            events,
            pendings: StdMutex::default(),
            limiter: StdMutex::default(),
            digests: StdMutex::default(),
            router: StdMutex::new(None),
            tasks: StdMutex::default(),
        });

        let router = Router::builder(endpoint)
            .accept(ENROL_ALPN, EnrolHandler(Arc::downgrade(&inner)))
            .accept(SYNC_ALPN, SyncHandler(Arc::downgrade(&inner)))
            .spawn();
        *inner.router.lock().unwrap() = Some(router);

        let mesh = Self { inner };
        mesh.restore_vaults();
        mesh.spawn_interval();
        Ok(mesh)
    }

    pub fn endpoint_id(&self) -> String {
        self.inner.secret.public().to_string()
    }

    pub fn addr(&self) -> EndpointAddr {
        self.inner.endpoint.addr()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<MeshEvent> {
        self.inner.events.subscribe()
    }

    pub fn info(&self) -> MeshInfo {
        MeshInfo {
            endpoint_id: self.endpoint_id(),
            relay_configured: self.inner.relay.as_ref().map(ToString::to_string),
            relay_home: self
                .inner
                .endpoint
                .addr()
                .relay_urls()
                .next()
                .map(ToString::to_string),
            direct_only: self.inner.options.direct_only,
        }
    }

    pub fn attached(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.inner.vaults.read().unwrap().keys().cloned().collect();
        ids.sort();
        ids
    }

    pub async fn shutdown(&self) {
        for task in self.inner.tasks.lock().unwrap().drain(..) {
            task.abort();
        }
        let router = self.inner.router.lock().unwrap().take();
        if let Some(router) = router {
            let _ = router.shutdown().await;
        }
        self.inner.endpoint.close().await;
    }

    // ----- vault attach / detach (T6) --------------------------------------------------

    /// Attach (or update) a mesh-live vault. Idempotent; the mesh vault id is created on
    /// the first attach and kept across detach/re-attach.
    pub async fn attach(
        &self,
        local_id: &str,
        path: &Path,
        content_roots: &[String],
    ) -> MeshResult<AttachInfo> {
        if !valid_local_id(local_id) {
            return invalid("Invalid vault id");
        }
        if !path.is_absolute() {
            return invalid("Vault path must be absolute");
        }
        let content_roots = normalize_content_roots(content_roots).map_err(MeshError::Invalid)?;
        tokio::fs::create_dir_all(path).await?;

        let existing = self.inner.vaults.read().unwrap().get(local_id).cloned();
        let vault = match existing {
            Some(vault) => vault,
            None => Arc::new(
                Vault::load(&self.inner.options.data_dir, local_id)
                    .map_err(internal)?
                    .unwrap_or_else(|| {
                        Vault::create(
                            &self.inner.options.data_dir,
                            local_id,
                            VaultData {
                                mesh_id: random_hex32(),
                                path: path.to_path_buf(),
                                content_roots: vec![],
                                attached: true,
                                peers: Default::default(),
                                entries: Default::default(),
                            },
                        )
                    }),
            ),
        };
        let mesh_vault = {
            let mut data = vault.data.lock().await;
            // A re-attach must re-pull even when the peers' manifests did not move.
            self.inner
                .digests
                .lock()
                .unwrap()
                .retain(|(v, _), _| v != &data.mesh_id);
            data.path = path.to_path_buf();
            data.content_roots = content_roots;
            data.attached = true;
            vault.save(&data).map_err(internal)?;
            data.mesh_id.clone()
        };
        self.inner
            .vaults
            .write()
            .unwrap()
            .insert(local_id.to_string(), vault.clone());
        self.spawn_pull_all(vault);
        Ok(AttachInfo { mesh_vault })
    }

    /// Stop syncing a vault (`syncMode` flipped away from `mesh-live`, ADR-018). Returns
    /// whether it was attached. The persisted state is kept for a later re-attach.
    pub async fn detach(&self, local_id: &str) -> MeshResult<bool> {
        let vault = self.inner.vaults.write().unwrap().remove(local_id);
        let Some(vault) = vault else {
            return Ok(false);
        };
        let mut data = vault.data.lock().await;
        data.attached = false;
        vault.save(&data).map_err(internal)?;
        Ok(true)
    }

    pub async fn mesh_vault_id(&self, local_id: &str) -> Option<String> {
        let vault = self.vault(local_id)?;
        let id = vault.data.lock().await.mesh_id.clone();
        Some(id)
    }

    fn vault(&self, local_id: &str) -> Option<Arc<Vault>> {
        self.inner.vaults.read().unwrap().get(local_id).cloned()
    }

    fn restore_vaults(&self) {
        let dir = self.inner.options.data_dir.join("vaults");
        let Ok(read) = std::fs::read_dir(dir) else {
            return;
        };
        for item in read.flatten() {
            let name = item.file_name().to_string_lossy().to_string();
            let Some(id) = name.strip_suffix(".json") else {
                continue;
            };
            match Vault::load(&self.inner.options.data_dir, id) {
                Ok(Some(vault)) => {
                    let attached = vault.data.try_lock().is_ok_and(|d| d.attached);
                    if attached {
                        let vault = Arc::new(vault);
                        self.inner
                            .vaults
                            .write()
                            .unwrap()
                            .insert(id.to_string(), vault.clone());
                        self.spawn_pull_all(vault);
                    }
                }
                Ok(None) => {}
                Err(e) => warn!("{e}"),
            }
        }
    }

    // ----- local changes (T6: POST /v1/mesh/changed) -----------------------------------

    /// A vault file changed on this side (Nuxt write, publish, delete or rename; or the
    /// daemon's own `PUT /v1/notes`). Re-hash (or record a tombstone), sign, notify peers.
    /// Returns whether the manifest changed.
    pub async fn local_changed(
        &self,
        local_id: &str,
        path: &str,
        writer: &str,
        published: bool,
        deleted: bool,
    ) -> MeshResult<bool> {
        let vault = self
            .vault(local_id)
            .ok_or_else(|| MeshError::NotFound(format!("Vault \"{local_id}\" is not attached")))?;
        let writer =
            parse_writer_identity(writer).map_err(|e| MeshError::Invalid(e.to_string()))?;
        let writer = format!("{}:{}", writer.kind, writer.id);

        let mut data = vault.data.lock().await;
        // Policy is checked on an unsigned draft: the local key may always publish.
        let draft = Entry {
            path: path.to_string(),
            writer: writer.clone(),
            hash: None,
            mtime_ms: 0,
            published,
            origin: self.endpoint_id(),
            sig: String::new(),
        };
        let note_id =
            check_policy(&draft, true, &data.content_roots).map_err(MeshError::Invalid)?;

        let existing = data.entries.get(path).cloned();
        let (hash, disk_mtime) = if deleted {
            (None, now_ms())
        } else {
            let file = resolve_note_file_path(&data.path, &note_id)
                .map_err(|e| MeshError::Invalid(e.to_string()))?;
            let bytes = match tokio::fs::read(&file).await {
                Ok(bytes) => bytes,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(MeshError::NotFound(format!("File not found: {path}")))
                }
                Err(e) => return Err(e.into()),
            };
            let modified = mtime_ms(&file).await?;
            (Some(blake3::hash(&bytes).to_hex().to_string()), modified)
        };

        if let Some(existing) = &existing {
            let same = existing.hash == hash
                && existing.published == published
                && existing.writer == writer
                && existing.origin == self.endpoint_id();
            if same {
                return Ok(false);
            }
        }
        // An explicit local change is always the newest state of the path.
        let mtime = existing
            .as_ref()
            .map_or(disk_mtime, |e| disk_mtime.max(e.mtime_ms + 1));
        let entry = Entry::sign(
            &self.inner.secret,
            &data.mesh_id,
            path,
            &writer,
            hash,
            mtime,
            published,
        );
        data.entries.insert(path.to_string(), entry);
        vault.save(&data).map_err(internal)?;
        drop(data);

        self.inner.notify_peers(&vault, None);
        Ok(true)
    }

    // ----- enrolment (T2) -------------------------------------------------------------

    /// Issue a one-time ticket for `local_id`. `writers` / `can_publish` are what the
    /// enrollee may author here; `self_*` is what this side asks to be allowed to author on
    /// the enrollee (the host asks for `canPublish`, a device does not).
    pub async fn issue_ticket(
        &self,
        local_id: &str,
        writers: &[String],
        can_publish: bool,
        self_writers: Option<Vec<String>>,
        self_can_publish: bool,
    ) -> MeshResult<String> {
        let vault = self
            .vault(local_id)
            .ok_or_else(|| MeshError::NotFound(format!("Vault \"{local_id}\" is not attached")))?;
        if writers.is_empty() {
            return invalid("At least one writer identity is required");
        }
        for pattern in writers.iter().chain(self_writers.iter().flatten()) {
            validate_writer_pattern(pattern)?;
        }
        let self_writers = self_writers.unwrap_or_else(|| {
            vec![
                self.inner.options.default_writer.clone(),
                "user:*".into(),
                "agent:*".into(),
            ]
        });
        let exp = now_secs() + TICKET_TTL_SECS;
        let code = self.inner.pendings.lock().unwrap().issue(Pending {
            vault: local_id.to_string(),
            writers: writers.to_vec(),
            can_publish,
            self_writers,
            self_can_publish,
            exp,
        });
        let addr = self.inner.endpoint.addr();
        // Direct addresses only matter when there is no relay to dial through.
        let addrs = if self.inner.relay.is_none() {
            addr.ip_addrs().map(ToString::to_string).collect()
        } else {
            vec![]
        };
        let mesh_id = vault.data.lock().await.mesh_id.clone();
        Ok(Ticket {
            id: self.endpoint_id(),
            relay: self.inner.relay.as_ref().map(ToString::to_string),
            addrs,
            vault: mesh_id,
            code,
            exp,
        }
        .encode())
    }

    /// Redeem a ticket for the local (attached) vault `local_id`. Returns the issuer's id.
    pub async fn enrol(&self, local_id: &str, ticket: &str) -> MeshResult<String> {
        let vault = self
            .vault(local_id)
            .ok_or_else(|| MeshError::NotFound(format!("Vault \"{local_id}\" is not attached")))?;
        let ticket = Ticket::decode(ticket).map_err(MeshError::Invalid)?;
        let addr = self
            .inner
            .addr_for(&ticket.id, ticket.relay.as_deref(), &ticket.addrs)?;

        let reply = tokio::time::timeout(CONNECT_TIMEOUT, async {
            let conn = self
                .inner
                .endpoint
                .connect(addr, ENROL_ALPN)
                .await
                .map_err(|e| format!("Cannot reach the issuer: {e}"))?;
            let reply: EnrolReply = call(
                &conn,
                &EnrolReq {
                    code: ticket.code.clone(),
                },
            )
            .await?;
            conn.close(0u32.into(), b"done");
            Ok::<_, String>(reply)
        })
        .await
        .map_err(|_| internal("Enrol timed out"))?
        .map_err(internal)?;

        let (Some(mesh_vault), Some(grant), true) = (reply.vault, reply.grant, reply.ok) else {
            return Err(MeshError::Refused(
                reply.error.unwrap_or_else(|| REFUSED.into()),
            ));
        };
        if mesh_vault != ticket.vault {
            return Err(MeshError::Refused(REFUSED.into()));
        }

        let mut data = vault.data.lock().await;
        if data.mesh_id != mesh_vault {
            if !data.peers.is_empty() {
                return invalid("This vault already joined another mesh vault");
            }
            // First join: adopt the shared vault id. The signature covers the vault id, so
            // re-sign what this side originated.
            data.mesh_id = mesh_vault.clone();
            let own = self.endpoint_id();
            for entry in data.entries.values_mut().filter(|e| e.origin == own) {
                *entry = Entry::sign(
                    &self.inner.secret,
                    &mesh_vault,
                    &entry.path,
                    &entry.writer,
                    entry.hash.clone(),
                    entry.mtime_ms,
                    entry.published,
                );
            }
        }
        data.peers.insert(
            ticket.id.clone(),
            Grant {
                relay: ticket.relay.clone(),
                addrs: ticket.addrs.clone(),
                ..grant
            },
        );
        vault.save(&data).map_err(internal)?;
        drop(data);

        self.spawn_pull_all(vault);
        Ok(ticket.id)
    }

    // ----- sync ------------------------------------------------------------------------

    /// Pull every peer of every attached vault now (the interval does this too).
    pub async fn sync_now(&self) {
        self.inner.pull_everything().await;
    }

    fn spawn_pull_all(&self, vault: Arc<Vault>) {
        let inner = self.inner.clone();
        tokio::spawn(async move { inner.pull_vault(&vault).await });
    }

    fn spawn_interval(&self) {
        let weak = Arc::downgrade(&self.inner);
        let interval = self.inner.options.sync_interval;
        let task = tokio::spawn(async move {
            loop {
                tokio::time::sleep(interval).await;
                let Some(inner) = weak.upgrade() else { return };
                inner.pull_everything().await;
            }
        });
        self.inner.tasks.lock().unwrap().push(task);
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// `kind:id` or `kind:*`.
fn validate_writer_pattern(pattern: &str) -> MeshResult<()> {
    match pattern.strip_suffix(":*") {
        Some(kind) => parse_writer_identity(&format!("{kind}:x")),
        None => parse_writer_identity(pattern),
    }
    .map(|_| ())
    .map_err(|e| MeshError::Invalid(e.to_string()))
}

// ----- wire helpers -------------------------------------------------------------------

/// One request/reply on a fresh bi-stream.
async fn call<Req: Serialize, Res: serde::de::DeserializeOwned>(
    conn: &Connection,
    request: &Req,
) -> Result<Res, String> {
    let (mut send, mut recv) = conn.open_bi().await.map_err(|e| e.to_string())?;
    send.write_all(&serde_json::to_vec(request).map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?;
    send.finish().map_err(|e| e.to_string())?;
    let raw = recv
        .read_to_end(MAX_REPLY)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_slice(&raw).map_err(|e| format!("bad reply: {e}"))
}

impl Inner {
    fn vault_by_mesh_id(&self, mesh_id: &str) -> Option<Arc<Vault>> {
        let vaults: Vec<Arc<Vault>> = self.vaults.read().unwrap().values().cloned().collect();
        vaults
            .into_iter()
            .find(|v| v.data.try_lock().is_ok_and(|d| d.mesh_id == mesh_id))
    }

    fn addr_for(
        &self,
        id: &str,
        relay: Option<&str>,
        addrs: &[String],
    ) -> MeshResult<EndpointAddr> {
        let id =
            EndpointId::from_str(id).map_err(|_| MeshError::Invalid("Bad endpoint id".into()))?;
        let mut addr = EndpointAddr::new(id);
        if let Some(relay) = relay
            .map(str::to_string)
            .or_else(|| self.relay.as_ref().map(ToString::to_string))
        {
            let url: RelayUrl = relay
                .parse()
                .map_err(|_| MeshError::Invalid("Bad relay URL".into()))?;
            addr = addr.with_relay_url(url);
        }
        for raw in addrs {
            if let Ok(socket) = raw.parse::<SocketAddr>() {
                addr = addr.with_ip_addr(socket);
            }
        }
        Ok(addr)
    }

    async fn connect(&self, vault: &Vault, peer: &str) -> Result<Connection, String> {
        let grant = vault
            .data
            .lock()
            .await
            .peers
            .get(peer)
            .cloned()
            .unwrap_or_default();
        let addr = self
            .addr_for(peer, grant.relay.as_deref(), &grant.addrs)
            .map_err(|e| e.to_string())?;
        tokio::time::timeout(CONNECT_TIMEOUT, self.endpoint.connect(addr, SYNC_ALPN))
            .await
            .map_err(|_| "connect timed out".to_string())?
            .map_err(|e| e.to_string())
    }

    /// Send `Changed` to every peer except `skip`; failures are fine (fallback pull).
    fn notify_peers(self: &Arc<Self>, vault: &Arc<Vault>, skip: Option<&str>) {
        let inner = self.clone();
        let vault = vault.clone();
        let skip = skip.map(str::to_string);
        tokio::spawn(async move {
            let (mesh_id, peers): (String, Vec<String>) = {
                let data = vault.data.lock().await;
                (data.mesh_id.clone(), data.peers.keys().cloned().collect())
            };
            for peer in peers.into_iter().filter(|p| Some(p) != skip.as_ref()) {
                let (inner, vault, mesh_id) = (inner.clone(), vault.clone(), mesh_id.clone());
                tokio::spawn(async move {
                    let Ok(conn) = inner.connect(&vault, &peer).await else {
                        return;
                    };
                    let _: Result<Reply, _> =
                        call(&conn, &SyncReq::Changed { vault: mesh_id }).await;
                    conn.close(0u32.into(), b"done");
                });
            }
        });
    }

    async fn pull_everything(self: &Arc<Self>) {
        let vaults: Vec<Arc<Vault>> = self.vaults.read().unwrap().values().cloned().collect();
        for vault in vaults {
            self.pull_vault(&vault).await;
        }
    }

    async fn pull_vault(self: &Arc<Self>, vault: &Arc<Vault>) {
        let peers: Vec<String> = vault.data.lock().await.peers.keys().cloned().collect();
        for peer in peers {
            if let Err(e) = self.pull_peer(vault, &peer).await {
                // Offline peers are normal; the next interval retries.
                warn!("pull from {peer} failed: {e}");
            }
        }
    }

    /// Notify-then-pull: fetch the peer's manifest, keep the entries that pass the apply
    /// policy and beat what we hold, fetch those blobs, apply. Returns entries applied.
    async fn pull_peer(self: &Arc<Self>, vault: &Arc<Vault>, peer: &str) -> Result<usize, String> {
        let (mesh_id, grants, roots) = {
            let data = vault.data.lock().await;
            (
                data.mesh_id.clone(),
                data.peers.clone(),
                data.content_roots.clone(),
            )
        };
        let conn = self.connect(vault, peer).await?;
        let result = self
            .pull_over(&conn, vault, peer, &mesh_id, &grants, &roots)
            .await;
        conn.close(0u32.into(), b"done");
        let applied = result?;
        if applied > 0 {
            // Forward what we now hold: a star through this peer converges too (ADR-020 §5).
            self.notify_peers(vault, Some(peer));
        }
        Ok(applied)
    }

    async fn pull_over(
        &self,
        conn: &Connection,
        vault: &Arc<Vault>,
        peer: &str,
        mesh_id: &str,
        grants: &entry::Grants,
        roots: &[String],
    ) -> Result<usize, String> {
        let reply: Reply = call(
            conn,
            &SyncReq::Manifest {
                vault: mesh_id.to_string(),
            },
        )
        .await?;
        let mut entries = match (reply.ok, reply.entries) {
            (true, Some(entries)) => entries,
            _ => return Err("peer refused the manifest".into()),
        };
        entries.sort_by(|a, b| a.path.cmp(&b.path).then(a.origin.cmp(&b.origin)));
        let digest = blake3::hash(&serde_json::to_vec(&entries).map_err(|e| e.to_string())?)
            .to_hex()
            .to_string();
        let key = (mesh_id.to_string(), peer.to_string());
        if self.digests.lock().unwrap().get(&key) == Some(&digest) {
            return Ok(0);
        }

        let own = self.secret.public().to_string();
        let mut wanted: Vec<Entry> = Vec::new();
        {
            let data = vault.data.lock().await;
            for entry in entries {
                if entry.origin == own {
                    continue;
                }
                if let Err(why) = check_remote(&entry, mesh_id, grants, roots) {
                    warn!("rejected {} from {peer}: {why}", entry.path);
                    continue;
                }
                if data
                    .entries
                    .get(&entry.path)
                    .is_some_and(|held| !entry.beats(held))
                {
                    continue;
                }
                wanted.push(entry);
            }
        }

        let mut blobs: HashMap<String, Vec<u8>> = HashMap::new();
        let mut pending: Vec<String> = wanted
            .iter()
            .filter(|e| !e.is_tombstone())
            .map(|e| e.path.clone())
            .collect();
        while !pending.is_empty() {
            let batch: Vec<String> = pending.iter().take(FETCH_BATCH).cloned().collect();
            let reply: Reply = call(
                conn,
                &SyncReq::Fetch {
                    vault: mesh_id.to_string(),
                    paths: batch.clone(),
                },
            )
            .await?;
            let got = reply.blobs.unwrap_or_default();
            if !reply.ok || got.is_empty() {
                // The peer lost a file since its manifest: retry on the next pull.
                return Err("peer could not serve the requested blobs".into());
            }
            for blob in got {
                let Ok(bytes) = BASE64.decode(blob.data.as_bytes()) else {
                    continue;
                };
                pending.retain(|p| p != &blob.path);
                blobs.insert(blob.path, bytes);
            }
            // Paths the peer skipped (budget) stay in `pending` and go in the next batch;
            // a path it dropped entirely is caught by the empty-batch check above.
            pending.retain(|p| !batch.contains(p) || blobs.contains_key(p));
        }

        let mut applied = 0;
        // Remember the manifest only when every wanted entry was handled: a failure (or a
        // detach mid-pull) must be retried by the next pull, not masked by the digest.
        let mut complete = true;
        for entry in wanted {
            let bytes = if entry.is_tombstone() {
                None
            } else {
                match blobs.remove(&entry.path) {
                    // The signed hash is the integrity check across forwarding hops.
                    Some(bytes)
                        if Some(blake3::hash(&bytes).to_hex().to_string()) == entry.hash =>
                    {
                        Some(bytes)
                    }
                    _ => {
                        warn!(
                            "blob for {} from {peer} does not match its signed hash",
                            entry.path
                        );
                        complete = false;
                        continue;
                    }
                }
            };
            match self.apply(vault, entry, bytes).await {
                Ok(true) => applied += 1,
                Ok(false) => {}
                Err(e) => {
                    warn!("apply failed: {e}");
                    complete = false;
                }
            }
        }
        if complete && vault.data.lock().await.attached {
            self.digests.lock().unwrap().insert(key, digest);
        }
        Ok(applied)
    }

    /// Apply one verified entry under the vault lock (LWW re-checked: a concurrent local
    /// change or another pull may have moved the path since the manifest was read).
    async fn apply(
        &self,
        vault: &Vault,
        entry: Entry,
        bytes: Option<Vec<u8>>,
    ) -> Result<bool, String> {
        let mut data = vault.data.lock().await;
        // A pull that started before `detach` (syncMode flipped, ADR-018) must not write.
        if !data.attached {
            return Ok(false);
        }
        let held = data.entries.get(&entry.path).cloned();
        if held.as_ref().is_some_and(|h| !entry.beats(h)) {
            return Ok(false);
        }
        let note_id = entry.note_id()?;
        let file = resolve_note_file_path(&data.path, &note_id).map_err(|e| e.to_string())?;

        // A file edited on this side but not yet announced must not be clobbered by an older
        // remote write: its own `changed` notification will win LWW.
        if let Ok(disk_mtime) = mtime_ms(&file).await {
            let disk_hash = tokio::fs::read(&file)
                .await
                .ok()
                .map(|b| blake3::hash(&b).to_hex().to_string());
            let tracked = held.as_ref().is_some_and(|h| h.hash == disk_hash);
            if !tracked && disk_hash != entry.hash && disk_mtime > entry.mtime_ms {
                return Ok(false);
            }
        }

        match &bytes {
            Some(bytes) => {
                write_atomic(&file, bytes)
                    .await
                    .map_err(|e| e.to_string())?;
                set_mtime_ms(&file, entry.mtime_ms)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            None => match tokio::fs::remove_file(&file).await {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            },
        }
        let event = MeshEvent {
            vault: vault.local_id.clone(),
            path: entry.path.clone(),
            mtime_ms: entry.mtime_ms,
            deleted: entry.is_tombstone(),
            persisted: true,
        };
        data.entries.insert(entry.path.clone(), entry);
        vault.save(&data)?;
        let _ = self.events.send(event);
        Ok(true)
    }

    // ----- server side -----------------------------------------------------------------

    async fn serve_sync(self: &Arc<Self>, remote: &str, request: SyncReq) -> Reply {
        let Some(vault) = self.vault_by_mesh_id(request.vault()) else {
            return Reply::refused();
        };
        let known = vault.data.lock().await.peers.contains_key(remote);
        if !known {
            warn!("refused sync from stranger {remote}");
            return Reply::refused();
        }
        match request {
            SyncReq::Changed { .. } => {
                let (inner, peer) = (self.clone(), remote.to_string());
                tokio::spawn(async move {
                    if let Err(e) = inner.pull_peer(&vault, &peer).await {
                        warn!("pull from {peer} failed: {e}");
                    }
                });
                Reply::ok()
            }
            SyncReq::Manifest { .. } => {
                let data = vault.data.lock().await;
                Reply {
                    ok: true,
                    entries: Some(data.entries.values().cloned().collect()),
                    ..Reply::default()
                }
            }
            SyncReq::Fetch { paths, .. } => {
                let mut blobs = Vec::new();
                let mut budget = FETCH_BUDGET;
                for path in paths {
                    // Held under the lock so the bytes match the signed hash we advertise.
                    let data = vault.data.lock().await;
                    let Some(Entry {
                        hash: Some(hash), ..
                    }) = data.entries.get(&path)
                    else {
                        continue;
                    };
                    let Ok(note_id) = entry::note_id_from_path(&path) else {
                        continue;
                    };
                    let Ok(file) = resolve_note_file_path(&data.path, &note_id) else {
                        continue;
                    };
                    let Ok(bytes) = tokio::fs::read(&file).await else {
                        continue;
                    };
                    if blake3::hash(&bytes).to_hex().as_str() != hash {
                        continue; // changed on disk, not yet re-announced
                    }
                    if !blobs.is_empty() && bytes.len() > budget {
                        break;
                    }
                    budget = budget.saturating_sub(bytes.len());
                    blobs.push(Blob {
                        path,
                        data: BASE64.encode(&bytes),
                    });
                }
                Reply {
                    ok: true,
                    blobs: Some(blobs),
                    ..Reply::default()
                }
            }
        }
    }

    async fn redeem(&self, remote: &str, request: EnrolReq) -> EnrolReply {
        let refused = || EnrolReply {
            error: Some(REFUSED.into()),
            ..EnrolReply::default()
        };
        // Nothing pending: nothing to guess, so no attempt is counted (strangers cannot
        // keep the global cap full in between real tickets).
        if !self.pendings.lock().unwrap().has_live() {
            return refused();
        }
        if !self.limiter.lock().unwrap().allow(remote) {
            warn!("enrol rate limit hit by {remote}");
            return refused();
        }
        let Some(pending) = self.pendings.lock().unwrap().consume(&request.code) else {
            warn!("enrol refused for {remote}");
            return refused();
        };
        let vault = self.vaults.read().unwrap().get(&pending.vault).cloned();
        let Some(vault) = vault else { return refused() };
        let mut data = vault.data.lock().await;
        data.peers.insert(
            remote.to_string(),
            Grant {
                writers: pending.writers,
                can_publish: pending.can_publish,
                relay: self.relay.as_ref().map(ToString::to_string),
                addrs: vec![],
            },
        );
        if vault.save(&data).is_err() {
            return refused();
        }
        EnrolReply {
            ok: true,
            vault: Some(data.mesh_id.clone()),
            grant: Some(Grant {
                writers: pending.self_writers,
                can_publish: pending.self_can_publish,
                ..Grant::default()
            }),
            ..EnrolReply::default()
        }
    }
}

// ----- iroh protocol handlers ---------------------------------------------------------

#[derive(Debug, Clone)]
struct SyncHandler(Weak<Inner>);

impl ProtocolHandler for SyncHandler {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let Some(inner) = self.0.upgrade() else {
            return Ok(());
        };
        let remote = connection.remote_id().to_string();
        // One connection carries several request/reply streams until the peer closes it.
        while let Ok((mut send, mut recv)) = connection.accept_bi().await {
            let raw = recv
                .read_to_end(MAX_REQUEST)
                .await
                .map_err(AcceptError::from_err)?;
            let reply = match serde_json::from_slice::<SyncReq>(&raw) {
                Ok(request) => inner.serve_sync(&remote, request).await,
                Err(_) => Reply::refused(),
            };
            let out = serde_json::to_vec(&reply).map_err(AcceptError::from_err)?;
            send.write_all(&out).await.map_err(AcceptError::from_err)?;
            send.finish()?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct EnrolHandler(Weak<Inner>);

impl ProtocolHandler for EnrolHandler {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let Some(inner) = self.0.upgrade() else {
            return Ok(());
        };
        // Open to strangers by design: bound how long one connection may hold a task.
        let serve = async {
            let remote = connection.remote_id().to_string();
            let (mut send, mut recv) = connection.accept_bi().await?;
            let raw = recv
                .read_to_end(MAX_REQUEST)
                .await
                .map_err(AcceptError::from_err)?;
            let reply = match serde_json::from_slice::<EnrolReq>(&raw) {
                Ok(request) => inner.redeem(&remote, request).await,
                Err(_) => EnrolReply {
                    error: Some(REFUSED.into()),
                    ..EnrolReply::default()
                },
            };
            let out = serde_json::to_vec(&reply).map_err(AcceptError::from_err)?;
            send.write_all(&out).await.map_err(AcceptError::from_err)?;
            send.finish()?;
            // Let the enrollee read the reply before the connection is torn down.
            connection.closed().await;
            Ok(())
        };
        match tokio::time::timeout(ENROL_TIMEOUT, serve).await {
            Ok(result) => result,
            Err(_) => {
                connection.close(1u32.into(), b"enrol timeout");
                Ok(())
            }
        }
    }
}
