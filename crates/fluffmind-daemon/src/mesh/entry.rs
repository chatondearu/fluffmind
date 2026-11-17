//! Signed manifest entries and the apply policy (ADR-020 §5, §7; ADR-017 on the wire).
//!
//! A manifest is a list of entries `path → (BLAKE3 | tombstone, mtimeMs, published?)`. Each
//! entry is signed by the key of the peer that originated it, and the signature covers the
//! vault id, so an entry stays checkable after any number of forwarding hops and cannot
//! be replayed into another vault.

use std::collections::BTreeMap;
use std::path::Path;

use data_encoding::HEXLOWER;
use iroh::{PublicKey, SecretKey, Signature};
use serde::{Deserialize, Serialize};

use crate::writer::{
    assert_note_id_writable_by_writer, parse_writer_identity, resolve_note_file_path,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Vault-relative mesh path with the `.md` extension, forward slashes.
    pub path: String,
    /// Writer identity (`kind:id`) that authored the change.
    pub writer: String,
    /// BLAKE3 hex of the file bytes; `None` is a tombstone (delete, or the old side of a rename).
    pub hash: Option<String>,
    pub mtime_ms: u64,
    /// Set only by the explicit publish action (and canonical deletes) on the origin peer.
    pub published: bool,
    /// Origin `EndpointId` (hex): the key that signed this entry.
    pub origin: String,
    /// ed25519 signature (hex) over [`Entry::signing_bytes`].
    pub sig: String,
}

/// What a peer may author in a vault (ADR-020 §6).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    /// Writer identities: exact `kind:id` or `kind:*`.
    pub writers: Vec<String>,
    /// May author canonical (root) entries.
    pub can_publish: bool,
    /// Dial hints remembered from enrolment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub addrs: Vec<String>,
}

impl Grant {
    pub fn allows_writer(&self, writer: &str) -> bool {
        self.writers.iter().any(|pattern| {
            pattern == writer
                || pattern
                    .strip_suffix(":*")
                    .is_some_and(|kind| writer.split_once(':').is_some_and(|(k, _)| k == kind))
        })
    }
}

pub type Grants = BTreeMap<String, Grant>;

impl Entry {
    pub fn is_tombstone(&self) -> bool {
        self.hash.is_none()
    }

    pub fn signing_bytes(&self, vault: &str) -> Vec<u8> {
        format!(
            "fluffmind/entry/1\n{vault}\n{}\n{}\n{}\n{}\n{}",
            self.path,
            self.writer,
            self.hash.as_deref().unwrap_or("-"),
            self.mtime_ms,
            self.published
        )
        .into_bytes()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn sign(
        secret: &SecretKey,
        vault: &str,
        path: &str,
        writer: &str,
        hash: Option<String>,
        mtime_ms: u64,
        published: bool,
    ) -> Self {
        let mut entry = Self {
            path: path.to_string(),
            writer: writer.to_string(),
            hash,
            mtime_ms,
            published,
            origin: secret.public().to_string(),
            sig: String::new(),
        };
        let sig = secret.sign(&entry.signing_bytes(vault));
        entry.sig = HEXLOWER.encode(&sig.to_bytes());
        entry
    }

    pub fn verify(&self, vault: &str) -> Result<(), String> {
        let key: PublicKey = self.origin.parse().map_err(|_| "bad origin key")?;
        let bytes: [u8; 64] = HEXLOWER
            .decode(self.sig.as_bytes())
            .ok()
            .and_then(|v| v.try_into().ok())
            .ok_or("bad signature encoding")?;
        key.verify(&self.signing_bytes(vault), &Signature::from_bytes(&bytes))
            .map_err(|_| "bad signature".to_string())
    }

    /// LWW per path: higher `mtimeMs` wins; a tie is broken by hash so every peer picks
    /// the same winner (a tombstone sorts lowest: a live file wins a tie).
    pub fn beats(&self, other: &Self) -> bool {
        (self.mtime_ms, self.hash.as_deref().unwrap_or(""))
            > (other.mtime_ms, other.hash.as_deref().unwrap_or(""))
    }

    /// Note id (path without `.md`), validated like every HTTP-supplied id.
    pub fn note_id(&self) -> Result<String, String> {
        note_id_from_path(&self.path)
    }
}

pub fn note_id_from_path(path: &str) -> Result<String, String> {
    if path.chars().any(char::is_control) {
        return Err("path contains control characters".into());
    }
    let id = path.strip_suffix(".md").ok_or("path must end with .md")?;
    // Placeholder root: only the path-shape checks matter here.
    resolve_note_file_path(Path::new("vault"), id).map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

pub fn is_writers_path(note_id: &str) -> bool {
    note_id.starts_with("writers/")
}

/// ADR-012: an empty list exposes the whole vault.
pub fn within_content_roots(note_id: &str, roots: &[String]) -> bool {
    roots.is_empty()
        || roots
            .iter()
            .any(|r| note_id == r || note_id.starts_with(&format!("{r}/")))
}

/// Path / writer / publish rules shared by local changes and remote entries.
/// `can_publish` is the grant of the origin (the local side always passes `true`).
pub fn check_policy(
    entry: &Entry,
    can_publish: bool,
    content_roots: &[String],
) -> Result<String, String> {
    let note_id = entry.note_id()?;
    if !within_content_roots(&note_id, content_roots) {
        return Err(format!("{} is outside the content roots", entry.path));
    }
    if let Some(hash) = &entry.hash {
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("malformed content hash".into());
        }
    }
    let writer = parse_writer_identity(&entry.writer).map_err(|e| e.to_string())?;
    if is_writers_path(&note_id) {
        if entry.published {
            return Err("a writers/ entry cannot be published".into());
        }
        assert_note_id_writable_by_writer(&note_id, &writer).map_err(|e| e.to_string())?;
    } else if !entry.published {
        return Err(format!(
            "{} is canonical but not marked published",
            entry.path
        ));
    } else if !can_publish {
        return Err("origin key has no canPublish grant".into());
    }
    Ok(note_id)
}

/// Full receive-side check for an entry from the wire.
pub fn check_remote(
    entry: &Entry,
    vault: &str,
    grants: &Grants,
    content_roots: &[String],
) -> Result<String, String> {
    let grant = grants
        .get(&entry.origin)
        .ok_or_else(|| format!("origin {} is not in the allow-list", entry.origin))?;
    entry.verify(vault)?;
    if is_writers_path(&entry.note_id().unwrap_or_default()) && !grant.allows_writer(&entry.writer)
    {
        return Err(format!(
            "origin {} may not author as {}",
            entry.origin, entry.writer
        ));
    }
    check_policy(entry, grant.can_publish, content_roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant(writers: &[&str], can_publish: bool) -> Grant {
        Grant {
            writers: writers.iter().map(|w| w.to_string()).collect(),
            can_publish,
            ..Grant::default()
        }
    }

    fn signed(secret: &SecretKey, path: &str, writer: &str, published: bool) -> Entry {
        Entry::sign(
            secret,
            "vault",
            path,
            writer,
            Some("0".repeat(64)),
            10,
            published,
        )
    }

    #[test]
    fn signature_binds_vault_and_fields() {
        let key = SecretKey::generate();
        let mut e = signed(&key, "writers/device/a/n.md", "device:a", false);
        assert!(e.verify("vault").is_ok());
        assert!(e.verify("other").is_err(), "replay into another vault");
        e.published = true;
        assert!(e.verify("vault").is_err(), "tampered flag");
    }

    #[test]
    fn lww_with_deterministic_tie_break() {
        let key = SecretKey::generate();
        let older = Entry::sign(&key, "v", "p.md", "device:a", Some("a".repeat(64)), 1, true);
        let newer = Entry::sign(&key, "v", "p.md", "device:a", Some("b".repeat(64)), 2, true);
        assert!(newer.beats(&older) && !older.beats(&newer));
        let tie_hi = Entry::sign(&key, "v", "p.md", "device:a", Some("f".repeat(64)), 5, true);
        let tie_lo = Entry::sign(&key, "v", "p.md", "device:a", Some("1".repeat(64)), 5, true);
        assert!(tie_hi.beats(&tie_lo) && !tie_lo.beats(&tie_hi));
        let tomb = Entry::sign(&key, "v", "p.md", "device:a", None, 5, true);
        assert!(
            tie_lo.beats(&tomb),
            "live file wins a tie against a tombstone"
        );
    }

    #[test]
    fn writer_prefix_and_publish_rules() {
        let device = SecretKey::generate();
        let host = SecretKey::generate();
        let mut grants = Grants::new();
        grants.insert(device.public().to_string(), grant(&["device:a"], false));
        grants.insert(host.public().to_string(), grant(&["user:*"], true));
        let check = |e: &Entry| check_remote(e, "vault", &grants, &[]);

        assert!(check(&signed(&device, "writers/device/a/n.md", "device:a", false)).is_ok());
        // A device may not author another writer's prefix, nor a prefix it was not granted.
        assert!(check(&signed(&device, "writers/device/b/n.md", "device:b", false)).is_err());
        assert!(check(&signed(&device, "writers/user/u/n.md", "user:u", false)).is_err());
        // Canonical: needs `published` AND a canPublish grant (self-asserted flag refused).
        assert!(check(&signed(&device, "notes/n.md", "device:a", true)).is_err());
        assert!(check(&signed(&host, "notes/n.md", "user:u", false)).is_err());
        assert!(check(&signed(&host, "notes/n.md", "user:u", true)).is_ok());
        // `user:*` pattern, and a writers/ entry may never be published.
        assert!(check(&signed(
            &host,
            "writers/user/anyone/n.md",
            "user:anyone",
            false
        ))
        .is_ok());
        assert!(check(&signed(&host, "writers/user/u/n.md", "user:u", true)).is_err());
        // Stranger and traversal.
        assert!(check(&signed(
            &SecretKey::generate(),
            "writers/device/a/n.md",
            "device:a",
            false
        ))
        .is_err());
        assert!(check(&signed(&host, "notes/../x.md", "user:u", true)).is_err());
        // Content roots filter what a vault exposes (ADR-012).
        let roots = vec!["notes".to_string()];
        assert!(check_remote(
            &signed(&host, "notes/n.md", "user:u", true),
            "vault",
            &grants,
            &roots
        )
        .is_ok());
        assert!(check_remote(
            &signed(&host, "other/n.md", "user:u", true),
            "vault",
            &grants,
            &roots
        )
        .is_err());
    }
}
