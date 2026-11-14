@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0" || exit /b 1

call "%~dp0scripts\resolve-bun.bat" || exit /b 1
where docker >nul 2>nul || (
  echo [RegChula] Docker Compose is required for MySQL and Redis.
  exit /b 1
)
docker info >nul 2>nul || (
  echo [RegChula] Docker Desktop is not ready.
  exit /b 1
)

"%BUN_EXE%" install --frozen-lockfile || exit /b 1
"%BUN_EXE%" run dev
exit /b %errorlevel%
