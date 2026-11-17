//! Writer identity, note ids and path resolution (ADR-017 / ADR-012).
//! Mirrors `apps/web/server/vault/{writer-prefix,note-id,hosted-writer}.ts`; both sides are
//! pinned by `tests/fixtures/writer-cases.json`.

use std::fmt;
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub enum NoteError {
    InvalidWriterIdentity(String),
    WriterPrefixViolation(String),
    InvalidNoteId(String),
}

impl NoteError {
    /// Error name shared with the TS classes (minus the `Error` suffix) in the case table.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::InvalidWriterIdentity(_) => "InvalidWriterIdentity",
            Self::WriterPrefixViolation(_) => "WriterPrefixViolation",
            Self::InvalidNoteId(_) => "InvalidNoteId",
        }
    }
}

impl fmt::Display for NoteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (Self::InvalidWriterIdentity(m)
        | Self::WriterPrefixViolation(m)
        | Self::InvalidNoteId(m)) = self;
        f.write_str(m)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Writer {
    pub kind: String,
    pub id: String,
}

const KINDS: [&str; 3] = ["device", "agent", "user"];

fn invalid_writer(message: &str) -> NoteError {
    NoteError::InvalidWriterIdentity(message.to_string())
}

fn invalid_id(message: &str) -> NoteError {
    NoteError::InvalidNoteId(message.to_string())
}

pub fn sanitize_writer_id(raw: &str) -> Result<String, NoteError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(invalid_writer("Writer id is required"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(invalid_writer(
            "Writer id must contain only letters, digits, \".\", \"_\", or \"-\"",
        ));
    }
    Ok(trimmed.to_string())
}

/// Parse `device|agent|user:<id>`.
pub fn parse_writer_identity(raw: &str) -> Result<Writer, NoteError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(invalid_writer(
            "Writer identity is required (device|agent|user:<id>)",
        ));
    }
    let colon = match trimmed.find(':') {
        Some(i) if i > 0 => i,
        _ => return Err(invalid_writer("Writer identity must look like kind:id")),
    };
    let kind = &trimmed[..colon];
    if !KINDS.contains(&kind) {
        return Err(invalid_writer("Writer kind must be device, agent, or user"));
    }
    Ok(Writer {
        kind: kind.to_string(),
        id: sanitize_writer_id(&trimmed[colon + 1..])?,
    })
}

pub fn writer_path_prefix(writer: &Writer) -> Result<String, NoteError> {
    Ok(format!(
        "writers/{}/{}",
        writer.kind,
        sanitize_writer_id(&writer.id)?
    ))
}

fn strip_slashes(id: &str) -> &str {
    id.trim().trim_start_matches('/').trim_end_matches('/')
}

fn is_under_writers_tree(note_id: &str) -> bool {
    let id = note_id.trim().trim_start_matches('/');
    id == "writers" || id.starts_with("writers/")
}

pub fn assert_note_id_writable_by_writer(note_id: &str, writer: &Writer) -> Result<(), NoteError> {
    let prefix = writer_path_prefix(writer)?;
    let id = strip_slashes(note_id);
    if id == prefix || id.starts_with(&format!("{prefix}/")) {
        return Ok(());
    }
    Err(NoteError::WriterPrefixViolation(format!(
        "Note \"{note_id}\" is outside writer prefix \"{prefix}/\""
    )))
}

/// Short ids become drafts under the writer prefix (mesh-live client shape).
pub fn note_id_for_mesh_writer(note_id: &str, writer: &Writer) -> Result<String, NoteError> {
    let id = strip_slashes(note_id);
    if is_under_writers_tree(id) {
        assert_note_id_writable_by_writer(id, writer)?;
        return Ok(id.to_string());
    }
    Ok(format!("{}/{id}", writer_path_prefix(writer)?))
}

/// Maps a note id (POSIX path without extension) to `<vault>/<id>.md`, rejecting
/// anything that could leave the vault root.
pub fn resolve_note_file_path(vault: &Path, id: &str) -> Result<PathBuf, NoteError> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err(invalid_id("Note id is required"));
    }
    if trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(invalid_id("Note id must use forward slashes only"));
    }
    if trimmed.starts_with('/') || trimmed.ends_with('/') {
        return Err(invalid_id("Note id must not start or end with a slash"));
    }
    if trimmed.ends_with(".md") {
        return Err(invalid_id("Note id must not include the .md extension"));
    }

    let mut path = vault.to_path_buf();
    for segment in trimmed.split('/') {
        if segment.is_empty() {
            return Err(invalid_id("Note id must not contain empty path segments"));
        }
        if segment == "." || segment == ".." {
            return Err(invalid_id(
                "Note id must not contain \".\" or \"..\" segments",
            ));
        }
        path.push(segment);
    }
    // A Windows drive prefix segment (`C:`) replaces the whole path on `push`.
    if !path.starts_with(vault) {
        return Err(invalid_id("Note id escapes the vault root"));
    }
    path.as_mut_os_string().push(".md");
    Ok(path)
}
