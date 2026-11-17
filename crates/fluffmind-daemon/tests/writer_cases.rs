//! Seam 1: writer identity / path resolution, driven by the case table the TS tests also read.

use std::path::Path;

use fluffmind_daemon::writer::{
    note_id_for_mesh_writer, parse_writer_identity, resolve_note_file_path, NoteError,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Cases {
    #[serde(rename = "parseWriterIdentity")]
    parse_writer_identity: Vec<ParseCase>,
    #[serde(rename = "noteIdForMeshWriter")]
    note_id_for_mesh_writer: Vec<NoteIdCase>,
    #[serde(rename = "resolveNoteFilePath")]
    resolve_note_file_path: Vec<ResolveCase>,
}

#[derive(Deserialize)]
struct ParseCase {
    input: String,
    ok: Option<Ident>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct Ident {
    kind: String,
    id: String,
}

#[derive(Deserialize)]
struct NoteIdCase {
    #[serde(rename = "noteId")]
    note_id: String,
    writer: String,
    ok: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct ResolveCase {
    id: String,
    ok: Option<String>,
    error: Option<String>,
}

fn cases() -> Cases {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/writer-cases.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// Every case states exactly one of `ok` / `error`.
fn expect<T: PartialEq + std::fmt::Debug>(
    label: &str,
    got: Result<T, NoteError>,
    ok: Option<T>,
    error: Option<String>,
) {
    match (got, ok, error) {
        (Ok(v), Some(want), None) => assert_eq!(v, want, "{label}"),
        (Err(e), None, Some(want)) => assert_eq!(e.kind(), want, "{label}: {e}"),
        (got, ok, error) => panic!("{label}: got {got:?}, expected ok={ok:?} error={error:?}"),
    }
}

#[test]
fn parse_writer_identity_cases() {
    for c in cases().parse_writer_identity {
        let got = parse_writer_identity(&c.input).map(|w| (w.kind, w.id));
        expect(&c.input, got, c.ok.map(|i| (i.kind, i.id)), c.error);
    }
}

#[test]
fn note_id_for_mesh_writer_cases() {
    for c in cases().note_id_for_mesh_writer {
        let got =
            parse_writer_identity(&c.writer).and_then(|w| note_id_for_mesh_writer(&c.note_id, &w));
        expect(&c.note_id, got, c.ok, c.error);
    }
}

#[test]
fn resolve_note_file_path_cases() {
    let vault = Path::new("/vault");
    for c in cases().resolve_note_file_path {
        let got = resolve_note_file_path(vault, &c.id);
        let want = c.ok.map(|rel| vault.join(rel));
        expect(&c.id, got, want, c.error);
    }
}
