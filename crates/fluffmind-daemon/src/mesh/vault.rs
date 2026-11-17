//! Per-vault mesh state: path, content roots, allow-list and the signed entry index.
//! Persisted as one JSON file per vault under `<data dir>/vaults/<local id>.json`.
//! shortcut: the whole file is rewritten on every change — fine for note-sized vaults,
//! move to an append log if an index ever gets large.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use super::entry::{Entry, Grants};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultData {
    /// Random 32 bytes (hex), created on first attach and carried in tickets. Peers know a
    /// vault by this id; the local id (Nuxt workspace id) never crosses the wire.
    pub mesh_id: String,
    pub path: PathBuf,
    pub content_roots: Vec<String>,
    pub attached: bool,
    pub peers: Grants,
    pub entries: BTreeMap<String, Entry>,
}

pub struct Vault {
    pub local_id: String,
    file: PathBuf,
    pub data: Mutex<VaultData>,
}

pub fn random_hex32() -> String {
    iroh::SecretKey::generate()
        .to_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Local ids become file names: keep them boring.
pub fn valid_local_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id != "."
        && id != ".."
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Same rules as `normalizeContentRoots` in `apps/web/server/vault/content-roots.ts`.
pub fn normalize_content_roots(roots: &[String]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for raw in roots {
        let root = raw.trim().trim_matches('/');
        if root.is_empty() || root.contains('\\') || root.contains('\0') {
            return Err("Invalid content root".into());
        }
        if root
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
        {
            return Err("Content root contains invalid path segments".into());
        }
        if !out.iter().any(|r| r == root) {
            out.push(root.to_string());
        }
    }
    Ok(out)
}

impl Vault {
    pub fn state_file(data_dir: &Path, local_id: &str) -> PathBuf {
        data_dir.join("vaults").join(format!("{local_id}.json"))
    }

    pub fn load(data_dir: &Path, local_id: &str) -> Result<Option<Self>, String> {
        let file = Self::state_file(data_dir, local_id);
        match std::fs::read(&file) {
            Ok(raw) => {
                let data = serde_json::from_slice(&raw)
                    .map_err(|e| format!("corrupt vault state {}: {e}", file.display()))?;
                Ok(Some(Self {
                    local_id: local_id.to_string(),
                    file,
                    data: Mutex::new(data),
                }))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn create(data_dir: &Path, local_id: &str, data: VaultData) -> Self {
        Self {
            local_id: local_id.to_string(),
            file: Self::state_file(data_dir, local_id),
            data: Mutex::new(data),
        }
    }
}

impl VaultData {
    /// Atomic replace (temp + rename), 0600 is not needed: no secrets live here.
    pub fn save(&self, file: &Path) -> Result<(), String> {
        let dir = file.parent().ok_or("state file has no parent")?;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let tmp = file.with_extension("json.tmp");
        let raw = serde_json::to_vec(self).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, raw).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, file).map_err(|e| e.to_string())
    }
}

impl Vault {
    pub fn save(&self, data: &VaultData) -> Result<(), String> {
        data.save(&self.file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_roots_are_normalized_like_the_ts_side() {
        let roots = |v: &[&str]| {
            normalize_content_roots(&v.iter().map(|s| s.to_string()).collect::<Vec<_>>())
        };
        assert_eq!(
            roots(&["/notes/", "notes", "a/b"]).unwrap(),
            ["notes", "a/b"]
        );
        assert!(roots(&["a/../b"]).is_err());
        assert!(roots(&[" / "]).is_err());
    }

    #[test]
    fn local_ids_stay_file_name_safe() {
        assert!(valid_local_id("ws_1.a-b"));
        assert!(!valid_local_id("../x"));
        assert!(!valid_local_id("a/b"));
        assert!(!valid_local_id(".."));
    }
}
