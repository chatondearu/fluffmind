//! Atomic file replacement shared by the HTTP writes and the mesh apply path.
//! The Nuxt app may write to the same vault concurrently (ADR-020 §3): never expose a
//! half-written file, so write a temp file in the same directory and rename it over.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, UNIX_EPOCH};

/// Distinguishes concurrent temp files in one process.
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Replace `path` with `content` atomically, creating parent directories.
pub async fn write_atomic(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    tokio::fs::create_dir_all(dir).await?;
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!(".fluffmind-{}-{seq}.tmp", std::process::id()));
    let written = match tokio::fs::write(&tmp, content).await {
        Ok(()) => tokio::fs::rename(&tmp, path).await,
        Err(e) => Err(e),
    };
    if written.is_err() {
        let _ = tokio::fs::remove_file(&tmp).await;
    }
    written
}

/// Set the modification time (ms since epoch) so LWW comparisons on disk agree with the
/// mesh entry that was just applied.
pub async fn set_mtime_ms(path: &Path, mtime_ms: u64) -> std::io::Result<()> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::OpenOptions::new().write(true).open(path)?;
        file.set_modified(UNIX_EPOCH + Duration::from_millis(mtime_ms))
    })
    .await
    .map_err(std::io::Error::other)?
}

/// Modification time of `path` in ms since epoch.
pub async fn mtime_ms(path: &Path) -> std::io::Result<u64> {
    let modified = tokio::fs::metadata(path).await?.modified()?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64))
}
