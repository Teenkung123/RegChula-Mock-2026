@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"
echo WARNING: This permanently deletes the local RegChula MySQL volume.
set /p answer=Type RESET-REGCHULA to continue: 
if not "%answer%"=="RESET-REGCHULA" (
  echo Reset cancelled.
  exit /b 1
)
docker compose -f "%PROJECT_DIR%\compose.yml" --project-directory "%PROJECT_DIR%" down -v
echo Local database removed. Run start.bat to create it again.
