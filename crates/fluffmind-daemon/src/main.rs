use std::net::IpAddr;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;
use fluffmind_daemon::server::{router, Config};
use fluffmind_daemon::{self_check, writer::parse_writer_identity};

/// Portable mesh-live write facade (no Git).
///
/// Set FLUFFMIND_DAEMON_TOKEN to require `Authorization: Bearer <token>` on every route except /health.
///
/// HTTP: GET /health · PUT /v1/notes {"id","content","writer"?} · GET /v1/notes?id=<note>&writer=<optional>
#[derive(Parser)]
#[command(name = "fluffmind-daemon", version)]
struct Cli {
    /// Vault folder root (required unless --self-check)
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
    /// Run the HTTP contract against a temp vault, then exit
    #[arg(long)]
    self_check: bool,
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

async fn run(cli: Cli) -> Result<(), String> {
    if cli.self_check {
        self_check::run().await?;
        println!("self-check: ok");
        return Ok(());
    }

    // Env only (never argv): a token on the command line leaks through `ps`.
    let token = std::env::var("FLUFFMIND_DAEMON_TOKEN")
        .ok()
        .filter(|t| !t.trim().is_empty());
    if token.is_none() && !is_loopback(&cli.host) {
        return Err(format!(
            "Refusing to bind {} without FLUFFMIND_DAEMON_TOKEN (required off-loopback)",
            cli.host
        ));
    }
    let writer = cli.writer.unwrap_or_else(default_writer);
    parse_writer_identity(&writer).map_err(|e| format!("--writer: {e}"))?;

    let vault = std::path::absolute(cli.vault.unwrap_or_default()).map_err(|e| e.to_string())?;
    let listener = tokio::net::TcpListener::bind((cli.host.as_str(), cli.port))
        .await
        .map_err(|e| format!("Cannot listen on {}:{}: {e}", cli.host, cli.port))?;
    println!(
        "fluffmind-daemon listening on http://{}:{}",
        cli.host, cli.port
    );
    println!(
        "vault={} writer={writer} syncMode=mesh-live",
        vault.display()
    );

    let app = router(Config {
        vault,
        default_writer: writer,
        token,
    });
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .map_err(|e| e.to_string())
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
