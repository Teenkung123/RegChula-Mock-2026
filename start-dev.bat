@echo off
setlocal enabledelayedexpansion
set "PROJECT_DIR=%~dp0"
if "!PROJECT_DIR:~-1!"=="\" set "PROJECT_DIR=!PROJECT_DIR:~0,-1!"
cd /d "!PROJECT_DIR!"

call "%~dp0scripts\resolve-bun.bat" || exit /b 1
where docker >nul 2>nul || (
  echo [RegChula] Docker Desktop is required for MySQL 8.4.
  exit /b 1
)
docker info >nul 2>nul || (
  echo [RegChula] Docker Desktop is not ready.
  exit /b 1
)

"!BUN_EXE!" run scripts/setup-env.ts || exit /b 1
"!BUN_EXE!" install --frozen-lockfile || exit /b 1
docker compose -f "!PROJECT_DIR!\compose.yml" --project-directory "!PROJECT_DIR!" up -d mysql redis || exit /b 1

set /a tries=0
:wait_mysql
for /f "usebackq delims=" %%H in (`docker inspect --format="{{.State.Health.Status}}" regchula-mysql 2^>nul`) do set "mysql_health=%%H"
if "!mysql_health!"=="healthy" goto mysql_ready
timeout /t 2 /nobreak >nul
set /a tries+=1
if !tries! GEQ 60 exit /b 1
goto wait_mysql

:mysql_ready
set /a tries=0
:wait_redis
for /f "usebackq delims=" %%H in (`docker inspect --format="{{.State.Health.Status}}" regchula-redis 2^>nul`) do set "redis_health=%%H"
if "!redis_health!"=="healthy" goto redis_ready
timeout /t 2 /nobreak >nul
set /a tries+=1
if !tries! GEQ 60 exit /b 1
goto wait_redis

:redis_ready
"!BUN_EXE!" run apps/api/src/cli/migrate.ts || exit /b 1
"!BUN_EXE!" run apps/api/src/cli/auth-state-cleanup.ts || exit /b 1
"!BUN_EXE!" run apps/api/src/cli/catalog-import.ts || exit /b 1
"!BUN_EXE!" run apps/api/src/cli/catalog-status.ts || exit /b 1
echo [RegChula] Development web: http://localhost:5173
"!BUN_EXE!" run scripts/dev.ts
