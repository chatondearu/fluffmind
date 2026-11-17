# Sync daemon sidecar helper for fluffmind.cmd (ADR-020). Packaged as bin\fluffmind-daemon.ps1.
# Usage: fluffmind-daemon.ps1 start|stop -Root <package dir> [-Vault <dir>] [-Port <n>]
param(
  [Parameter(Mandatory)][ValidateSet('start', 'stop')][string]$Action,
  [Parameter(Mandatory)][string]$Root,
  [string]$Vault,
  [int]$Port = 8787
)
$ErrorActionPreference = 'Stop'
$data = Join-Path $Root 'data'
$pidFile = Join-Path $data 'fluffmind-daemon.pid'
$log = Join-Path $data 'fluffmind-daemon.log'

# The daemon process recorded in the pid file. The name check guards against a recycled pid.
function Get-Daemon {
  if (Test-Path -LiteralPath $pidFile) {
    $recorded = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
    if ($recorded) {
      return Get-Process -Id $recorded -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -eq 'fluffmind-daemon' }
    }
  }
}

function Stop-Daemon {
  Get-Daemon | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Test-Healthy {
  try { (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2).StatusCode -eq 200 }
  catch { $false }
}

if ($Action -eq 'stop') { Stop-Daemon; exit 0 }

# A daemon left behind by a crashed launcher (Ctrl+C / closed window skips cleanup), or
# a second `start` on a running instance: keep it when healthy, reap it otherwise.
if ((Get-Daemon) -and (Test-Healthy)) { exit 0 }
Stop-Daemon

New-Item -ItemType Directory -Force -Path (Join-Path $data 'daemon') | Out-Null
$env:FLUFFMIND_DAEMON_DATA = Join-Path $data 'daemon'
$proc = Start-Process -FilePath (Join-Path $Root 'bin\fluffmind-daemon.exe') `
  -ArgumentList @('--vault', "`"$Vault`"", '--host', '127.0.0.1', '--port', $Port) `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $proc.Id

for ($i = 0; $i -lt 100 -and -not $proc.HasExited; $i++) {
  if ((Test-Healthy) -and -not $proc.HasExited) { exit 0 }
  Start-Sleep -Milliseconds 200
}
Write-Host "error: sync daemon failed to start on port $Port - see $log.err"
Write-Host '  (port in use? try --daemon-port <n>, or --no-daemon)'
Stop-Daemon
exit 1
