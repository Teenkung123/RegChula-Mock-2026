@echo off
setlocal enabledelayedexpansion
set "PROJECT_DIR=%~dp0"
if "!PROJECT_DIR:~-1!"=="\" set "PROJECT_DIR=!PROJECT_DIR:~0,-1!"
cd /d "!PROJECT_DIR!"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\close-public-tunnel.ps1"
if errorlevel 1 echo [RegChula] Warning: the public tunnel could not be closed automatically.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\staff-k8s-tunnel.ps1" -Stop
if errorlevel 1 echo [RegChula] Warning: the staff portal tunnel could not be closed automatically.
call "%~dp0scripts\check-k8s.bat"
if errorlevel 1 (
  echo [RegChula] !kube_unavailable_reason!
  exit /b 1
)
kubectl --context=docker-desktop -n regchula delete hpa regchula-api regchula-web --ignore-not-found >nul 2>nul
kubectl --context=docker-desktop -n regchula scale deployment/regchula-api deployment/regchula-web deployment/regchula-staff --replicas=0 >nul 2>nul
kubectl --context=docker-desktop -n regchula scale statefulset/regchula-mysql statefulset/regchula-redis --replicas=0 >nul 2>nul
docker compose -f "!PROJECT_DIR!\compose.yml" --project-directory "!PROJECT_DIR!" stop mysql redis >nul 2>nul
echo [RegChula] Workloads stopped. Kubernetes PVC and original Docker volume were not deleted.
