//! Portable Fluffmind daemon (ADR-020): HTTP facade writing mesh-live notes under
//! `writers/<kind>/<id>/` — no Git.

pub mod self_check;
pub mod server;
pub mod writer;
