//! Tiny HTTP/1.1 JSON client for the CLI subcommands that talk to a running daemon
//! (`ticket`, `enrol`). Plain `http://` only: the daemon binds loopback by default and a
//! TLS-terminating proxy is out of scope for a local operator command.

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub async fn request_json(
    method: &str,
    url: &str,
    token: Option<&str>,
    body: Option<&Value>,
) -> Result<(u16, Value), String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or("Daemon URL must start with http://")?;
    let (authority, path) = rest.split_once('/').map_or((rest, ""), |(a, p)| (a, p));
    let payload = body.map(Value::to_string).unwrap_or_default();
    let auth = token.map_or(String::new(), |t| format!("Authorization: Bearer {t}\r\n"));
    let request = format!(
        "{method} /{path} HTTP/1.1\r\nHost: {authority}\r\n{auth}Content-Type: application/json\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    let mut stream = TcpStream::connect(authority)
        .await
        .map_err(|e| format!("Cannot reach the daemon at {authority}: {e}"))?;
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .await
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&raw);
    let (head, body) = text
        .split_once("\r\n\r\n")
        .ok_or("Malformed HTTP response")?;
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or("Malformed HTTP status line")?;
    // axum answers JSON with Content-Length, never chunked; anything else fails to parse.
    Ok((status, serde_json::from_str(body).unwrap_or(Value::Null)))
}
