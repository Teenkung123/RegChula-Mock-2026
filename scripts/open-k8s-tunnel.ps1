param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$kubectl = (Get-Command kubectl.exe -ErrorAction Stop).Source
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue)
$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
$tunnels = @()

foreach ($ownerId in $owners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    $command = $process.CommandLine
    # Reclaim only the exact tunnel created by this launcher.
    $matchesTunnel = $process.ExecutablePath -eq $kubectl -and
        $command -match '\s--context=docker-desktop(?:\s|$)' -and
        $command -match '\s-n\s+regchula(?:\s|$)' -and
        $command -match '\sport-forward\s+service/regchula-web\s+5173:80(?:\s|$)' -and
        $command -match '\s--address\s+(?:127\.0\.0\.1|0\.0\.0\.0)(?:\s|$)'
    if (-not $matchesTunnel) {
        Write-Host "[RegChula] Port 5173 belongs to another process (PID $ownerId). Close it or choose another port before starting."
        exit 1
    }
    $tunnels += $process
}

if ($CheckOnly) {
    Write-Host "[RegChula] Tunnel preflight passed; $($tunnels.Count) existing RegChula tunnel(s)."
    exit 0
}

foreach ($tunnel in $tunnels) {
    # Check identity again before stopping, in case the old process exited and its PID was reused.
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($tunnel.ProcessId)"
    if ($current -and $current.CreationDate -eq $tunnel.CreationDate -and $current.CommandLine -eq $tunnel.CommandLine) {
        Write-Host "[RegChula] Replacing the previous RegChula tunnel (PID $($tunnel.ProcessId))."
        Stop-Process -Id $tunnel.ProcessId -ErrorAction Stop
        Wait-Process -Id $tunnel.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
    }
}

Write-Host '[RegChula] This terminal owns the tunnel. Press Ctrl+C to close it; run stop.bat to stop workloads.'
& $kubectl --context=docker-desktop -n regchula port-forward service/regchula-web 5173:80 --address 0.0.0.0
exit $LASTEXITCODE
