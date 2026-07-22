@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Fluffmind portable launcher (Windows). Packaged as bin\fluffmind.cmd

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "NODE_BIN=%ROOT%\runtime\node\node.exe"
set "SERVER_ENTRY=%ROOT%\app\.output\server\index.mjs"
set "DEFAULT_VAULT=%ROOT%\vault"
set "DATA_DIR=%ROOT%\data"
set "PID_FILE=%DATA_DIR%\fluffmind.pid"
set "LOG_FILE=%DATA_DIR%\fluffmind.log"

set "VAULT="
if not defined PORT set "PORT=3000"
if not defined HOST set "HOST=127.0.0.1"
set "OPEN_BROWSER=1"
set "READONLY=0"
set "CMD=run"

:parse
if "%~1"=="" goto after_parse
if /I "%~1"=="run" (
  set "CMD=run"
  shift
  goto parse
)
if /I "%~1"=="start" (
  set "CMD=start"
  shift
  goto parse
)
if /I "%~1"=="stop" (
  set "CMD=stop"
  shift
  goto parse
)
if /I "%~1"=="status" (
  set "CMD=status"
  shift
  goto parse
)
if /I "%~1"=="--vault" (
  set "VAULT=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--port" (
  set "PORT=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--host" (
  set "HOST=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--no-open" (
  set "OPEN_BROWSER=0"
  shift
  goto parse
)
if /I "%~1"=="--readonly" (
  set "READONLY=1"
  shift
  goto parse
)
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
echo Unknown argument: %~1
goto usage

:usage
echo Fluffmind portable ^(solo mode — no Docker, no Postgres^)
echo.
echo Usage:
echo   fluffmind [command] [--vault path] [--port n] [--host addr] [--readonly] [--no-open] [--help]
echo.
echo Commands:
echo   run      Foreground ^(default; Ctrl+C stops^)
echo   start    Background ^(no terminal needed^)
echo   stop     Stop background instance
echo   status   Show background status
echo.
echo Vault: --vault, else VAULT_PATH env, else ^<package^>\vault
echo Options: --readonly rejects vault mutations ^(VAULT_READONLY=true^)
echo Requires: git on PATH
exit /b 1

:after_parse
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if /I "%CMD%"=="status" goto do_status
if /I "%CMD%"=="stop" goto do_stop

if not "%VAULT%"=="" goto vault_ready
if defined VAULT_PATH (
  set "VAULT=%VAULT_PATH%"
) else (
  set "VAULT=%DEFAULT_VAULT%"
)

:vault_ready
if not exist "%VAULT%" mkdir "%VAULT%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if not exist "%NODE_BIN%" (
  echo error: embedded Node runtime not found at %NODE_BIN%
  exit /b 1
)
if not exist "%SERVER_ENTRY%" (
  echo error: Nitro server entry not found at %SERVER_ENTRY%
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo error: git is required on PATH ^(install Git for Windows, then retry^).
  exit /b 1
)

set "VAULT_PATH=%VAULT%"
set "WORKSPACES_ROOT=%DATA_DIR%"
set "AUTH_DISABLED=true"
set "DATABASE_URL="
set "NODE_ENV=production"
set "NITRO_HOST=%HOST%"
set "NITRO_PORT=%PORT%"
if "%READONLY%"=="1" set "VAULT_READONLY=true"

set "READONLY_LABEL=no"
if /I "%VAULT_READONLY%"=="true" set "READONLY_LABEL=yes"

set "URL=http://%HOST%:%PORT%"

if /I "%CMD%"=="start" goto do_start

REM Foreground (run)
echo Fluffmind solo
echo   vault: %VAULT_PATH%
echo   readonly: %READONLY_LABEL%
echo   url:   %URL%
echo   ^(Ctrl+C to stop — or use: fluffmind start^)

if "%OPEN_BROWSER%"=="1" (
  start "" cmd /c "timeout /t 2 /nobreak >nul & start \"\" \"%URL%\""
)

"%NODE_BIN%" "%SERVER_ENTRY%"
exit /b %ERRORLEVEL%

:do_status
powershell -NoProfile -Command ^
  "if (-not (Test-Path -LiteralPath '%PID_FILE%')) { Write-Host 'Fluffmind is not running'; exit 1 };" ^
  "$procId = Get-Content -LiteralPath '%PID_FILE%' -ErrorAction SilentlyContinue;" ^
  "if (-not $procId) { Write-Host 'Fluffmind is not running'; exit 1 };" ^
  "try { Get-Process -Id $procId -ErrorAction Stop | Out-Null; Write-Host \"Fluffmind is running (pid $procId)\"; Write-Host \"  log: %LOG_FILE%\"; exit 0 }" ^
  "catch { Write-Host 'Fluffmind is not running'; Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue; exit 1 }"
exit /b %ERRORLEVEL%

:do_stop
powershell -NoProfile -Command ^
  "if (-not (Test-Path -LiteralPath '%PID_FILE%')) { Write-Host 'Fluffmind is not running'; exit 0 };" ^
  "$procId = Get-Content -LiteralPath '%PID_FILE%' -ErrorAction SilentlyContinue;" ^
  "if (-not $procId) { Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue; Write-Host 'Fluffmind is not running'; exit 0 };" ^
  "Write-Host \"Stopping Fluffmind (pid $procId)...\";" ^
  "try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {};" ^
  "Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host 'Stopped.'"
exit /b 0

:do_start
powershell -NoProfile -Command ^
  "if (Test-Path -LiteralPath '%PID_FILE%') {" ^
  "  $old = Get-Content -LiteralPath '%PID_FILE%' -ErrorAction SilentlyContinue;" ^
  "  if ($old) { try { Get-Process -Id $old -ErrorAction Stop | Out-Null; Write-Host \"Fluffmind is already running (pid $old).\"; Write-Host \"  Use: fluffmind stop\"; exit 1 } catch {} }" ^
  "  Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue" ^
  "};" ^
  "$env:VAULT_PATH='%VAULT_PATH%'; $env:WORKSPACES_ROOT='%WORKSPACES_ROOT%'; $env:AUTH_DISABLED='true';" ^
  "if ('%VAULT_READONLY%' -eq 'true') { $env:VAULT_READONLY='true' };" ^
  "$env:DATABASE_URL=$null; $env:NODE_ENV='production'; $env:NITRO_HOST='%HOST%'; $env:NITRO_PORT='%PORT%'; $env:HOST='%HOST%'; $env:PORT='%PORT%';" ^
  "$proc = Start-Process -FilePath '%NODE_BIN%' -ArgumentList @('%SERVER_ENTRY%') -WorkingDirectory '%ROOT%' -RedirectStandardOutput '%LOG_FILE%' -RedirectStandardError '%LOG_FILE%' -WindowStyle Hidden -PassThru;" ^
  "Set-Content -LiteralPath '%PID_FILE%' -Value $proc.Id;" ^
  "Start-Sleep -Milliseconds 400;" ^
  "try { Get-Process -Id $proc.Id -ErrorAction Stop | Out-Null } catch { Write-Host \"error: server exited immediately — see %LOG_FILE%\"; Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue; exit 1 };" ^
  "Write-Host 'Fluffmind solo (background)';" ^
  "Write-Host \"  vault: %VAULT_PATH%\";" ^
  "Write-Host \"  readonly: %READONLY_LABEL%\";" ^
  "Write-Host \"  url:   %URL%\";" ^
  "Write-Host \"  log:   %LOG_FILE%\";" ^
  "Write-Host '  stop:  fluffmind stop';" ^
  "exit 0"
if errorlevel 1 exit /b 1

if "%OPEN_BROWSER%"=="1" (
  start "" cmd /c "timeout /t 2 /nobreak >nul & start \"\" \"%URL%\""
)
exit /b 0
