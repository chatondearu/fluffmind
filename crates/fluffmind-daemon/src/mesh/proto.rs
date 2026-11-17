//! Wire protocol: one JSON request/reply per bi-stream (ADR-020 §4).
//! ALPNs are versioned per protocol; a wire change bumps the suffix.

use serde::{Deserialize, Serialize};

use super::entry::{Entry, Grant};

pub const ENROL_ALPN: &[u8] = b"fluffmind/enrol/1";
pub const SYNC_ALPN: &[u8] = b"fluffmind/sync/1";

/// Requests are tiny; replies carry manifests and blobs.
pub const MAX_REQUEST: usize = 1024 * 1024;
pub const MAX_REPLY: usize = 128 * 1024 * 1024;
/// Soft cap of raw blob bytes per `Fetch` reply (at least one blob is always sent).
pub const FETCH_BUDGET: usize = 16 * 1024 * 1024;
/// Larger files are never served (a note is text); keeps replies under `MAX_REPLY`.
pub const MAX_BLOB: usize = 32 * 1024 * 1024;
pub const FETCH_BATCH: usize = 32;

/// Refusal for strangers, unknown vaults and malformed requests alike (no oracle).
pub const REFUSED: &str = "refused";

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum SyncReq {
    /// "My manifest for this vault moved": the receiver pulls.
    Changed {
        vault: String,
    },
    Manifest {
        vault: String,
    },
    Fetch {
        vault: String,
        paths: Vec<String>,
    },
}

impl SyncReq {
    pub fn vault(&self) -> &str {
        match self {
            Self::Changed { vault } | Self::Manifest { vault } | Self::Fetch { vault, .. } => vault,
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Blob {
    pub path: String,
    /// Standard base64 of the file bytes.
    pub data: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Reply {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entries: Option<Vec<Entry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blobs: Option<Vec<Blob>>,
}

impl Reply {
    pub fn ok() -> Self {
        Self {
            ok: true,
            ..Self::default()
        }
    }

    pub fn refused() -> Self {
        Self {
            error: Some(REFUSED.into()),
            ..Self::default()
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnrolReq {
    pub code: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct EnrolReply {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Mesh vault id the enrollee joins.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vault: Option<String>,
    /// What the issuer may author on the enrollee's side (the enrollee records it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grant: Option<Grant>,
}
