//! Enrolment tickets and one-time codes (ADR-020 §6; controls from neomind PRD-88).
//!
//! A ticket carries `EndpointId + relay + vault + one-time code`. The code is single-use,
//! expires, and redeem attempts are rate limited per source and globally. Every refusal is
//! the same opaque string so a stranger learns nothing (unknown vs expired vs replayed).

use std::collections::HashMap;
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use data_encoding::BASE32_NOPAD;
use serde::{Deserialize, Serialize};

pub const TICKET_PREFIX: &str = "fm1.";
pub const TICKET_TTL_SECS: u64 = 900;
pub const REDEEM_PER_SOURCE: u32 = 5;
pub const REDEEM_GLOBAL: u32 = 30;
pub const REDEEM_WINDOW_SECS: u64 = 300;
/// Opaque refusal text for every redeem failure.
pub const REFUSED: &str = "enrol refused";

/// Crockford base32 (no I, L, O, U): easy to type.
const CROCKFORD: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Ticket {
    /// Issuer `EndpointId` (hex).
    pub id: String,
    /// Issuer relay URL, when one is configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay: Option<String>,
    /// Issuer direct socket addresses (LAN / tests).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub addrs: Vec<String>,
    /// Mesh vault id (hex) the enrollee joins.
    pub vault: String,
    /// One-time code (secret).
    pub code: String,
    /// Unix expiry, seconds.
    pub exp: u64,
}

// The code is a secret: never print it through `{:?}`.
impl fmt::Debug for Ticket {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Ticket")
            .field("id", &self.id)
            .field("vault", &self.vault)
            .field("code", &"<redacted>")
            .finish_non_exhaustive()
    }
}

impl Ticket {
    pub fn encode(&self) -> String {
        let raw = serde_json::to_vec(self).expect("ticket serializes");
        format!("{TICKET_PREFIX}{}", BASE32_NOPAD.encode(&raw))
    }

    pub fn decode(raw: &str) -> Result<Self, String> {
        let body = raw
            .trim()
            .strip_prefix(TICKET_PREFIX)
            .ok_or("Not a fluffmind ticket")?;
        let bytes = BASE32_NOPAD
            .decode(body.to_ascii_uppercase().as_bytes())
            .map_err(|_| "Malformed ticket")?;
        let mut ticket: Self = serde_json::from_slice(&bytes).map_err(|_| "Malformed ticket")?;
        ticket.code = normalize_code(&ticket.code);
        if now_secs() > ticket.exp {
            return Err("Ticket expired".into());
        }
        Ok(ticket)
    }
}

/// What the issuing side granted when it created the code.
#[derive(Debug, Clone)]
pub struct Pending {
    /// Local vault id on the issuing daemon.
    pub vault: String,
    /// Writer identities the enrollee may author.
    pub writers: Vec<String>,
    pub can_publish: bool,
    /// Grant the issuer asks for on the enrollee's side (what it may author there).
    pub self_writers: Vec<String>,
    pub self_can_publish: bool,
    pub exp: u64,
}

/// Pending codes live in memory: a daemon restart invalidates open tickets (they are
/// short-lived by design; re-issue one).
#[derive(Default)]
pub struct Pendings(HashMap<String, Pending>);

impl Pendings {
    pub fn issue(&mut self, pending: Pending) -> String {
        let now = now_secs();
        self.0.retain(|_, p| p.exp > now);
        let code = random_code();
        self.0.insert(code.clone(), pending);
        code
    }

    pub fn has_live(&self) -> bool {
        let now = now_secs();
        self.0.values().any(|p| p.exp > now)
    }

    /// Single-use: the code is removed whether or not it was still valid.
    pub fn consume(&mut self, code: &str) -> Option<Pending> {
        let pending = self.0.remove(&normalize_code(code))?;
        (pending.exp > now_secs()).then_some(pending)
    }
}

/// Fixed-window limiter: per source and global.
#[derive(Default)]
pub struct RedeemLimiter {
    window_start: u64,
    global: u32,
    per_source: HashMap<String, u32>,
}

impl RedeemLimiter {
    /// Count one attempt; `false` means locked out.
    pub fn allow(&mut self, source: &str) -> bool {
        let now = now_secs();
        if now.saturating_sub(self.window_start) >= REDEEM_WINDOW_SECS {
            self.window_start = now;
            self.global = 0;
            self.per_source.clear();
        }
        let used = self.per_source.get(source).copied().unwrap_or(0);
        if self.global >= REDEEM_GLOBAL || used >= REDEEM_PER_SOURCE {
            return false;
        }
        self.global += 1;
        self.per_source.insert(source.to_string(), used + 1);
        true
    }
}

fn random_code() -> String {
    let bytes = iroh::SecretKey::generate().to_bytes();
    // 256 % 32 == 0: the modulo keeps the distribution uniform.
    bytes[..12]
        .iter()
        .map(|b| CROCKFORD[*b as usize % CROCKFORD.len()] as char)
        .collect()
}

/// Strip separators, uppercase, map the ambiguous Crockford aliases.
pub fn normalize_code(raw: &str) -> String {
    raw.chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| match c.to_ascii_uppercase() {
            'I' | 'L' => '1',
            'O' => '0',
            'U' => 'V',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(exp: u64) -> Pending {
        Pending {
            vault: "v".into(),
            writers: vec!["device:x".into()],
            can_publish: false,
            self_writers: vec![],
            self_can_publish: false,
            exp,
        }
    }

    #[test]
    fn ticket_roundtrip_and_redaction() {
        let ticket = Ticket {
            id: "ab".into(),
            relay: None,
            addrs: vec!["127.0.0.1:1".into()],
            vault: "cd".into(),
            code: "ABCD1234EFGH".into(),
            exp: now_secs() + 60,
        };
        let back = Ticket::decode(&ticket.encode()).unwrap();
        assert_eq!(back.vault, "cd");
        assert_eq!(back.addrs, ticket.addrs);
        assert!(!format!("{ticket:?}").contains("ABCD1234EFGH"));
        assert!(Ticket::decode("garbage").is_err());
    }

    #[test]
    fn expired_ticket_is_rejected() {
        let ticket = Ticket {
            id: "ab".into(),
            relay: None,
            addrs: vec![],
            vault: "cd".into(),
            code: "X".into(),
            exp: now_secs().saturating_sub(1),
        };
        assert!(Ticket::decode(&ticket.encode()).is_err());
    }

    #[test]
    fn code_is_single_use_and_expires() {
        let mut pendings = Pendings::default();
        let code = pendings.issue(pending(now_secs() + 60));
        assert!(pendings.consume(&code.to_lowercase()).is_some());
        assert!(pendings.consume(&code).is_none(), "replay");
        let stale = pendings.issue(pending(now_secs().saturating_sub(1)));
        assert!(pendings.consume(&stale).is_none(), "expired");
    }

    #[test]
    fn limiter_trips_per_source() {
        let mut limiter = RedeemLimiter::default();
        for _ in 0..REDEEM_PER_SOURCE {
            assert!(limiter.allow("a"));
        }
        assert!(!limiter.allow("a"));
        assert!(limiter.allow("b"));
    }
}
