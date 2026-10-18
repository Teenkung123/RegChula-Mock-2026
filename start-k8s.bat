@echo off
setlocal enabledelayedexpansion
set "PROJECT_DIR=%~dp0"
if "!PROJECT_DIR:~-1!"=="\" set "PROJECT_DIR=!PROJECT_DIR:~0,-1!"
cd /d "!PROJECT_DIR!"

call "%~dp0scripts\resolve-bun.bat" || exit /b 1
where docker >nul 2>nul || (
  echo [RegChula] Docker Desktop is required.
  exit /b 1
)
where kubectl >nul 2>nul || (
  echo [RegChula] kubectl is required. Enable Kubernetes in Docker Desktop.
  exit /b 1
)
docker info >nul 2>nul || (
  echo [RegChula] Docker Desktop is not ready.
  exit /b 1
)
call "%~dp0scripts\check-k8s.bat"
if errorlevel 1 (
  echo [RegChula] !kube_unavailable_reason!
  exit /b 1
)
echo [RegChula] Preparing exact dependencies and local secrets...
"!BUN_EXE!" run scripts/setup-env.ts || exit /b 1
"!BUN_EXE!" install --frozen-lockfile || exit /b 1

kubectl --context=docker-desktop apply -f deploy/k8s/base/namespace.yaml || exit /b 1
set "seed_required=1"
set "seed_marker=0"
set "seed_pvc=0"
kubectl --context=docker-desktop -n regchula get configmap regchula-data-seeded >nul 2>nul
if not errorlevel 1 set "seed_marker=1"
kubectl --context=docker-desktop -n regchula get pvc data-regchula-mysql-0 >nul 2>nul
if not errorlevel 1 set "seed_pvc=1"
if "!seed_marker!!seed_pvc!"=="11" set "seed_required=0"
if "!seed_marker!!seed_pvc!"=="10" (
  echo [RegChula] Seed marker exists but the database PVC is missing. Refusing automatic recovery.
  exit /b 1
)
if "!seed_marker!!seed_pvc!"=="01" (
  echo [RegChula] Database PVC exists without its seed marker. Refusing to overwrite possible data.
  exit /b 1
)
if "!seed_required!"=="0" if not exist ".env.k8s.local" (
  echo [RegChula] .env.k8s.local is missing for the existing Kubernetes database. Refusing to rotate secrets.
  exit /b 1
)
if "!seed_required!"=="0" if not exist ".env.k8s.mysql.local" (
  echo [RegChula] .env.k8s.mysql.local is missing for the existing Kubernetes database. Refusing to rotate secrets.
  exit /b 1
)
if "!seed_required!"=="0" if not exist ".env.k8s.redis.local" (
  echo [RegChula] .env.k8s.redis.local is missing. Refusing to rotate the existing shared-state secret.
  exit /b 1
)
"!BUN_EXE!" run scripts/setup-k8s-env.ts || exit /b 1
for %%F in (.env.k8s.local .env.k8s.mysql.local .env.k8s.redis.local) do (
  icacls "%%F" /inheritance:r /grant:r "%USERNAME%:(F)" "SYSTEM:(F)" "BUILTIN\Administrators:(F)" >nul 2>nul || (
    echo [RegChula] Could not restrict permissions for %%F.
    exit /b 1
  )
)

if "!seed_required!"=="0" goto seed_ready
echo [RegChula] Preparing a logical seed from the existing recoverable Docker volume...
docker compose -f "!PROJECT_DIR!\compose.yml" --project-directory "!PROJECT_DIR!" up -d mysql || exit /b 1
set /a tries=0
:wait_compose_mysql
for /f "usebackq delims=" %%H in (`docker inspect --format="{{.State.Health.Status}}" regchula-mysql 2^>nul`) do set "mysql_health=%%H"
if "!mysql_health!"=="healthy" goto compose_mysql_ready
timeout /t 2 /nobreak >nul
set /a tries+=1
if !tries! GEQ 60 (
  echo [RegChula] Existing MySQL did not become healthy within 120 seconds.
  exit /b 1
)
goto wait_compose_mysql
:compose_mysql_ready
"!BUN_EXE!" run apps/api/src/cli/migrate.ts || exit /b 1
"!BUN_EXE!" run apps/api/src/cli/catalog-import.ts || exit /b 1
"!BUN_EXE!" run apps/api/src/cli/catalog-status.ts || exit /b 1
if not exist "tmp" mkdir "tmp"
docker exec regchula-mysql mysqldump -uregchula -pregchula_dev --single-transaction --no-tablespaces --routines --triggers --events --hex-blob --default-character-set=utf8mb4 regchula > "tmp\regchula-k8s-seed.sql" || exit /b 1
:seed_ready

echo [RegChula] Building pinned local API and web images...
docker build -f apps/api/Dockerfile -t regchula-api:local . || exit /b 1
docker build -f apps/web/Dockerfile -t regchula-web:local . || exit /b 1
set "release_id=!RANDOM!-!RANDOM!"
"!BUN_EXE!" run scripts/prepare-k8s-release.ts !release_id! || exit /b 1
set "release_dir=tmp\k8s-releases\!release_id!"

echo [RegChula] Applying private Kubernetes database and network boundaries...
  kubectl --context=docker-desktop -n regchula create secret generic regchula-runtime --from-env-file=.env.k8s.local --dry-run=client -o yaml | kubectl --context=docker-desktop apply -f - || exit /b 1
kubectl --context=docker-desktop -n regchula create secret generic regchula-mysql --from-env-file=.env.k8s.mysql.local --dry-run=client -o yaml | kubectl --context=docker-desktop apply -f - || exit /b 1
kubectl --context=docker-desktop -n regchula create secret generic regchula-redis --from-env-file=.env.k8s.redis.local --dry-run=client -o yaml | kubectl --context=docker-desktop apply -f - || exit /b 1
kubectl --context=docker-desktop apply -f deploy/k8s/base/network-policy.yaml || exit /b 1
kubectl --context=docker-desktop apply -f deploy/k8s/base/mysql.yaml || exit /b 1
kubectl --context=docker-desktop apply -f deploy/k8s/base/redis.yaml || exit /b 1
kubectl --context=docker-desktop -n regchula rollout status statefulset/regchula-mysql --timeout=300s || exit /b 1
kubectl --context=docker-desktop -n regchula rollout status statefulset/regchula-redis --timeout=180s || exit /b 1

if "!seed_required!"=="0" goto data_seeded
echo [RegChula] Restoring the logical seed into the new Kubernetes volume...
kubectl --context=docker-desktop -n regchula exec -i statefulset/regchula-mysql -- sh -c "mysql -uroot -p$MYSQL_ROOT_PASSWORD regchula" < "tmp\regchula-k8s-seed.sql" || exit /b 1
kubectl --context=docker-desktop -n regchula create configmap regchula-data-seeded --from-literal=source=preserved-compose-volume || exit /b 1
docker compose -f "!PROJECT_DIR!\compose.yml" --project-directory "!PROJECT_DIR!" stop mysql >nul
echo [RegChula] Original Docker volume retained as rollback data.
:data_seeded

echo [RegChula] Running one controlled migration and catalog-import job...
kubectl --context=docker-desktop -n regchula delete job regchula-bootstrap --ignore-not-found --wait=true >nul 2>nul
kubectl --context=docker-desktop apply -f "!release_dir!\jobs.yaml" || exit /b 1
kubectl --context=docker-desktop -n regchula wait --for=condition=complete job/regchula-bootstrap --timeout=600s
if errorlevel 1 (
  kubectl --context=docker-desktop -n regchula logs job/regchula-bootstrap --tail=100
  exit /b 1
)

echo [RegChula] Starting three API and two web replicas...
kubectl --context=docker-desktop apply -f "!release_dir!\api.yaml" || exit /b 1
kubectl --context=docker-desktop apply -f "!release_dir!\web.yaml" || exit /b 1
kubectl --context=docker-desktop -n regchula rollout restart deployment/regchula-api deployment/regchula-web || exit /b 1
kubectl --context=docker-desktop -n regchula rollout status deployment/regchula-api --timeout=180s || exit /b 1
kubectl --context=docker-desktop -n regchula rollout status deployment/regchula-web --timeout=180s || exit /b 1
"!BUN_EXE!" run scripts/verify-k8s-release.ts !release_id! || exit /b 1

kubectl --context=docker-desktop get --raw /apis/metrics.k8s.io/v1beta1 >nul 2>nul
if errorlevel 1 (
  kubectl --context=docker-desktop -n regchula delete hpa regchula-api regchula-web --ignore-not-found >nul 2>nul
  echo [RegChula] Metrics Server is unavailable; keeping 3 API and 2 web replicas.
) else (
  kubectl --context=docker-desktop apply -f deploy/k8s/hpa.yaml || exit /b 1
  echo [RegChula] Horizontal autoscaling enabled: API 3-8, web 2-4 replicas.
)

echo.
echo [RegChula] Web and API: http://localhost:5173
echo [RegChula] OpenAPI:     http://localhost:5173/openapi
echo [RegChula] Original Docker and Kubernetes volumes are both preserved.
echo.
if /i "%~1"=="public" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-public-tunnel.ps1"
  exit /b !errorlevel!
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-k8s-tunnel.ps1"
exit /b !errorlevel!
