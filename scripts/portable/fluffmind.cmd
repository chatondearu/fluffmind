@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Fluffmind portable launcher (Windows). Packaged as bin\fluffmind.cmd

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "NODE_BIN=%ROOT%\runtime\node\node.exe"
set "SERVER_ENTRY=%ROOT%\app\.output\server\index.mjs"
set "DEFAULT_VAULT=%ROOT%\vault"
set "DATA_DIR=%ROOT%\data"

set "VAULT="
if not defined PORT set "PORT=3000"
if not defined HOST set "HOST=127.0.0.1"
set "OPEN_BROWSER=1"

:parse
if "%~1"=="" goto after_parse
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
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
echo Unknown argument: %~1
goto usage

:usage
echo Fluffmind portable ^(solo mode — no Docker, no Postgres^)
echo.
echo Usage:
echo   fluffmind [--vault path] [--port n] [--host addr] [--no-open] [--help]
echo.
echo Vault: --vault, else VAULT_PATH env, else ^<package^>\vault
echo Requires: git on PATH
exit /b 1

:after_parse
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

set "URL=http://%HOST%:%PORT%"
echo Fluffmind solo
echo   vault: %VAULT_PATH%
echo   url:   %URL%
echo   ^(Ctrl+C to stop^)

if "%OPEN_BROWSER%"=="1" (
  start "" cmd /c "timeout /t 2 /nobreak >nul & start \"\" \"%URL%\""
)

"%NODE_BIN%" "%SERVER_ENTRY%"
exit /b %ERRORLEVEL%
