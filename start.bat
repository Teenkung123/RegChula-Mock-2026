@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "requested=%~1"
set "check_only=0"
if /i "!requested!"=="check" set "check_only=1"
if not "!requested!"=="" if /i not "!requested!"=="check" if /i not "!requested!"=="dev" if /i not "!requested!"=="k8s" if /i not "!requested!"=="public" (
  echo Usage: start.bat [dev^|k8s^|public^|check]
  exit /b 2
)

if not "!check_only!"=="1" (
  call :ensure_docker
  if errorlevel 1 (
    set "exit_code=!errorlevel!"
    goto startup_failed
  )
)

if /i "!requested!"=="dev" goto use_dev
if /i "!requested!"=="k8s" goto use_k8s
if /i "!requested!"=="public" goto use_public
call "%~dp0scripts\check-k8s.bat"
if errorlevel 1 goto use_dev
goto use_k8s

:use_dev
if defined kube_unavailable_reason echo [RegChula] !kube_unavailable_reason!
if "!check_only!"=="1" (
  echo [RegChula] Startup mode: development fallback.
  exit /b 0
)
echo [RegChula] Starting the development stack.
call "%~dp0start-dev.bat"
set "exit_code=!errorlevel!"
if not "!exit_code!"=="0" goto startup_failed
exit /b 0

:use_k8s
if "!check_only!"=="1" (
  echo [RegChula] Startup mode: local Kubernetes.
  exit /b 0
)
call "%~dp0start-k8s.bat"
set "exit_code=!errorlevel!"
if not "!exit_code!"=="0" goto startup_failed
exit /b 0

:use_public
echo [RegChula] Starting the production web build with a public HTTPS tunnel.
call "%~dp0start-k8s.bat" public
set "exit_code=!errorlevel!"
if not "!exit_code!"=="0" goto startup_failed
exit /b 0

:ensure_docker
where docker >nul 2>nul || (
  echo [RegChula] Docker Desktop is required but its command-line tool was not found.
  exit /b 1
)
docker info >nul 2>nul
if not errorlevel 1 exit /b 0

set "docker_desktop_exe="
for %%D in (
  "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  "%LOCALAPPDATA%\Docker\Docker Desktop.exe"
) do if not defined docker_desktop_exe if exist "%%~D" set "docker_desktop_exe=%%~fD"

if not defined docker_desktop_exe (
  echo [RegChula] Docker Desktop is installed, but its application could not be found.
  echo [RegChula] Start Docker Desktop manually, then run start.bat again.
  exit /b 1
)

echo [RegChula] Starting Docker Desktop. This can take up to three minutes...
start "" "!docker_desktop_exe!"
set /a docker_tries=0
:wait_docker
docker info >nul 2>nul
if not errorlevel 1 (
  echo [RegChula] Docker Desktop is ready.
  exit /b 0
)
set /a docker_tries+=1
if !docker_tries! GEQ 90 (
  echo [RegChula] Docker Desktop did not become ready within three minutes.
  echo [RegChula] Check Docker Desktop for a startup error, then run start.bat again.
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_docker

:startup_failed
echo.
echo [RegChula] Startup failed with exit code !exit_code!.
if "!requested!"=="" (
  echo [RegChula] Press any key to close this window.
  pause >nul
)
exit /b !exit_code!
