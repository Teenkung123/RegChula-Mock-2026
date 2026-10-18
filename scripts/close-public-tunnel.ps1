$ErrorActionPreference = 'Stop'
$localPort = 15173
$kubectl = (Get-Command kubectl.exe -ErrorAction SilentlyContinue).Source
$tailscale = (Get-Command tailscale.exe -ErrorAction SilentlyContinue).Source

if ($tailscale) {
    & $tailscale funnel --https=443 off
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[RegChula] Tailscale Funnel did not close cleanly.'
        exit $LASTEXITCODE
    }
}

if ($kubectl) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $localPort -ErrorAction SilentlyContinue)
    $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($ownerId in $owners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
        $command = $process.CommandLine
        $matchesTunnel = $process.ExecutablePath -eq $kubectl -and
            $command -match '\s--context=docker-desktop(?:\s|$)' -and
            $command -match '\s-n\s+regchula(?:\s|$)' -and
            $command -match "\sport-forward\s+service/regchula-web\s+$($localPort):80(?:\s|$)" -and
            $command -match '\s--address\s+127\.0\.0\.1(?:\s|$)'
        if ($matchesTunnel) {
            Stop-Process -Id $process.ProcessId -ErrorAction Stop
            Wait-Process -Id $process.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
        }
    }
}

Write-Host '[RegChula] Public access is off. Local workloads were left running.'
