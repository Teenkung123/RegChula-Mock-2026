@echo off
rem Read-only probe shared by automatic and explicit Kubernetes startup.
set "kube_unavailable_reason="
where kubectl >nul 2>nul
if errorlevel 1 (
  set "kube_unavailable_reason=kubectl was not found in PATH. Install the Docker Desktop command-line tools."
  exit /b 1
)
kubectl config get-contexts -o name >nul
if errorlevel 1 (
  set "kube_unavailable_reason=kubectl could not read its configuration. Check the error above and KUBECONFIG."
  exit /b 1
)
set "desktop_context="
for /f "delims=" %%C in ('kubectl config get-contexts -o name') do if "%%C"=="docker-desktop" set "desktop_context=%%C"
if not defined desktop_context (
  set "kube_unavailable_reason=The docker-desktop context is missing from kubeconfig. Check Docker Desktop Kubernetes settings and KUBECONFIG."
  exit /b 1
)
kubectl --context=docker-desktop --request-timeout=10s get --raw=/readyz >nul
if errorlevel 1 (
  set "kube_unavailable_reason=The Docker Desktop Kubernetes API did not pass its readiness check. See the kubectl error above."
  exit /b 1
)
exit /b 0
