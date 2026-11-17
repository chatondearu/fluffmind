use std::net::IpAddr;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use clap::{Args, Parser, Subcommand};
use fluffmind_daemon::client::request_json;
use fluffmind_daemon::mesh::{Mesh, MeshOptions};
use fluffmind_daemon::server::{router, Config, DEFAULT_VAULT_ID};
use fluffmind_daemon::{self_check, writer::parse_writer_identity};
use serde_json::json;

/// Fluffmind sync daemon: HTTP facade for mesh-live notes plus an iroh mesh peer (no Git).
///
/// Set FLUFFMIND_DAEMON_TOKEN to require `Authorization: Bearer <token>` on every route except /health.
/// Mesh: FLUFFMIND_RELAY_URL (self-hosted iroh-relay; n0 public relays are a dev fallback),
/// FLUFFMIND_MESH_DIRECT=1 (no relay: LAN / tests), FLUFFMIND_SYNC_INTERVAL_SECS (default 60),
/// FLUFFMIND_MESH_MDNS=0 (disable LAN discovery), FLUFFMIND_DAEMON_DATA (key + vault state).
///
/// HTTP: GET /health · PUT /v1/notes · GET /v1/notes · PUT /v1/vaults/:id · POST /v1/mesh/changed ·
/// GET /v1/events (SSE) · POST /v1/vaults/:id/tickets · POST /v1/vaults/:id/enrol
#[derive(Parser)]
#[command(name = "fluffmind-daemon", version, subcommand_negates_reqs = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
    /// Vault folder root, attached as mesh vault "default" (required unless --self-check)
    #[arg(long, required_unless_present = "self_check")]
    vault: Option<PathBuf>,
    /// Listen port
    #[arg(long, default_value_t = 8787, value_parser = clap::value_parser!(u16).range(1..))]
    port: u16,
    /// Bind address; a non-loopback address requires FLUFFMIND_DAEMON_TOKEN
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    /// Default writer identity [default: device:$SYNC_WRITER_DEVICE or device:solo]
    #[arg(long)]
    writer: Option<String>,
    /// Node key and per-vault mesh state [default: ~/.fluffmind-daemon]
    #[arg(long, env = "FLUFFMIND_DAEMON_DATA")]
    data_dir: Option<PathBuf>,
    /// Run the HTTP contract against a temp vault, then exit
    #[arg(long)]
    self_check: bool,
}

#[derive(Subcommand)]
enum Command {
    /// Issue an enrolment ticket on a running daemon (prints the ticket)
    Ticket {
        /// Writer identity the enrollee may author (repeatable), e.g. device:laptop
        #[arg(long = "writer", required = true)]
        writers: Vec<String>,
        /// Let the enrollee publish canonical (root) notes
        #[arg(long)]
        can_publish: bool,
        /// Ask the enrollee to let this daemon publish canonical notes (the host does)
        #[arg(long)]
        self_can_publish: bool,
        #[command(flatten)]
        target: Target,
    },
    /// Redeem a ticket on a running daemon
    Enrol {
        ticket: String,
        #[command(flatten)]
        target: Target,
    },
}

#[derive(Args)]
struct Target {
    /// Local vault id on the running daemon
    #[arg(long, default_value = DEFAULT_VAULT_ID)]
    vault_id: String,
    /// Running daemon base URL
    #[arg(
        long,
        env = "FLUFFMIND_DAEMON_URL",
        default_value = "http://127.0.0.1:8787"
    )]
    url: String,
}

fn is_loopback(host: &str) -> bool {
    host == "localhost" || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

fn default_writer() -> String {
    match std::env::var("SYNC_WRITER_DEVICE") {
        Ok(device) if !device.trim().is_empty() => format!("device:{}", device.trim()),
        _ => "device:solo".into(),
    }
}

fn env_flag(name: &str) -> Option<bool> {
    std::env::var(name)
        .ok()
        .map(|v| matches!(v.trim(), "1" | "true" | "yes"))
}

fn env_token() -> Option<String> {
    // Env only (never argv): a token on the command line leaks through `ps`.
    std::env::var("FLUFFMIND_DAEMON_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty())
}

fn data_dir(cli: &Cli) -> Result<PathBuf, String> {
    if let Some(dir) = &cli.data_dir {
        return Ok(dir.clone());
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|home| PathBuf::from(home).join(".fluffmind-daemon"))
        .ok_or_else(|| "Set --data-dir or FLUFFMIND_DAEMON_DATA (no home directory)".into())
}

async fn operator_command(command: Command) -> Result<(), String> {
    let token = env_token();
    let (path, body, target) = match command {
        Command::Ticket {
            writers,
            can_publish,
            self_can_publish,
            target,
        } => {
            let body = json!({ "writers": writers, "canPublish": can_publish, "selfCanPublish": self_can_publish });
            ("tickets", body, target)
        }
        Command::Enrol { ticket, target } => ("enrol", json!({ "ticket": ticket }), target),
    };
    let url = format!(
        "{}/v1/vaults/{}/{path}",
        target.url.trim_end_matches('/'),
        target.vault_id
    );
    let method = "POST";
    let (status, reply) = request_json(method, &url, token.as_deref(), Some(&body)).await?;
    if status >= 400 {
        return Err(reply["error"]
            .as_str()
            .unwrap_or("request failed")
            .to_string());
    }
    match reply["ticket"].as_str() {
        Some(ticket) => println!("{ticket}"),
        None => println!("enrolled with {}", reply["peer"].as_str().unwrap_or("?")),
    }
    Ok(())
}

async fn run(cli: Cli) -> Result<(), String> {
    if let Some(command) = cli.command {
        return operator_command(command).await;
    }
    if cli.self_check {
        self_check::run().await?;
        println!("self-check: ok");
        return Ok(());
    }

    let token = env_token();
    if token.is_none() && !is_loopback(&cli.host) {
        return Err(format!(
            "Refusing to bind {} without FLUFFMIND_DAEMON_TOKEN (required off-loopback)",
            cli.host
        ));
    }
    let writer = cli.writer.clone().unwrap_or_else(default_writer);
    parse_writer_identity(&writer).map_err(|e| format!("--writer: {e}"))?;

    let data = data_dir(&cli)?;
    let vault =
        std::path::absolute(cli.vault.clone().unwrap_or_default()).map_err(|e| e.to_string())?;
    let listener = tokio::net::TcpListener::bind((cli.host.as_str(), cli.port))
        .await
        .map_err(|e| format!("Cannot listen on {}:{}: {e}", cli.host, cli.port))?;

    let interval = std::env::var("FLUFFMIND_SYNC_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|s| *s > 0)
        .unwrap_or(60);
    let mesh = Mesh::start(MeshOptions {
        data_dir: data,
        relay_url: std::env::var("FLUFFMIND_RELAY_URL")
            .ok()
            .filter(|u| !u.trim().is_empty()),
        direct_only: env_flag("FLUFFMIND_MESH_DIRECT").unwrap_or(false),
        mdns: env_flag("FLUFFMIND_MESH_MDNS").unwrap_or(true),
        sync_interval: Duration::from_secs(interval),
        default_writer: writer.clone(),
        relay_ca_tls: None,
        relay_only: false,
    })
    .await?;
    mesh.attach(DEFAULT_VAULT_ID, &vault, &[])
        .await
        .map_err(|e| e.to_string())?;

    println!(
        "fluffmind-daemon listening on http://{}:{}",
        cli.host, cli.port
    );
    println!(
        "vault={} writer={writer} syncMode=mesh-live",
        vault.display()
    );
    println!("mesh endpoint id={}", mesh.endpoint_id());

    let app = router(Config {
        vault,
        default_writer: writer,
        mesh: Some(mesh.clone()),
        token,
    });
    let served = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| e.to_string());
    mesh.shutdown().await;
    served
}

/// Ctrl+C, plus SIGTERM on unix: `docker stop` and the portable launcher both send it.
async fn shutdown_signal() {
    #[cfg(unix)]
    if let Ok(mut term) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
    {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
        return;
    }
    let _ = tokio::signal::ctrl_c().await;
}

#[tokio::main]
async fn main() -> ExitCode {
    match run(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}
