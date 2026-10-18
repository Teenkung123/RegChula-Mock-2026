param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$localPort = 15173
$publicOrigin = 'https://main-pc.taila84498.ts.net'
$kubectl = (Get-Command kubectl.exe -ErrorAction Stop).Source
$tailscale = (Get-Command tailscale.exe -ErrorAction Stop).Source

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $localPort -ErrorAction SilentlyContinue)
$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
$managedTunnels = @()

foreach ($ownerId in $owners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    $command = $process.CommandLine
    $matchesTunnel = $process.ExecutablePath -eq $kubectl -and
        $command -match '\s--context=docker-desktop(?:\s|$)' -and
        $command -match '\s-n\s+regchula(?:\s|$)' -and
        $command -match "\sport-forward\s+service/regchula-web\s+$($localPort):80(?:\s|$)" -and
        $command -match '\s--address\s+127\.0\.0\.1(?:\s|$)'
    if (-not $matchesTunnel) {
        Write-Host "[RegChula] Private tunnel port $localPort belongs to another process (PID $ownerId)."
        exit 1
    }
    $managedTunnels += $process
}

if ($CheckOnly) {
    Write-Host "[RegChula] Public tunnel preflight passed; $($managedTunnels.Count) existing private port-forward(s)."
    exit 0
}

if ($managedTunnels.Count -eq 0) {
    $arguments = @(
        '--context=docker-desktop',
        '-n', 'regchula',
        'port-forward',
        'service/regchula-web',
        "$($localPort):80",
        '--address', '127.0.0.1'
    )
    $portForward = Start-Process -FilePath $kubectl -ArgumentList $arguments -WindowStyle Hidden -PassThru
    Write-Host "[RegChula] Started the private Kubernetes bridge (PID $($portForward.Id))."
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$localPort" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $ready) {
    Write-Host '[RegChula] The production web service did not become ready for public tunneling.'
    exit 1
}

$foregroundFunnels = @(
    Get-CimInstance Win32_Process -Filter "Name = 'tailscale.exe'" |
        Where-Object {
            $_.ExecutablePath -eq $tailscale -and
            $_.CommandLine -match '\sfunnel\s+(?:http://127\.0\.0\.1:)?(?:5173|15173)(?:\s|$)' -and
            $_.CommandLine -notmatch '\s--bg(?:\s|$)'
        }
)
foreach ($funnel in $foregroundFunnels) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($funnel.ProcessId)"
    if ($current -and $current.CreationDate -eq $funnel.CreationDate -and $current.CommandLine -eq $funnel.CommandLine) {
        Write-Host "[RegChula] Replacing the foreground development Funnel (PID $($funnel.ProcessId))."
        Stop-Process -Id $funnel.ProcessId -ErrorAction Stop
        Wait-Process -Id $funnel.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
    }
}

& $tailscale funnel --bg --yes "http://127.0.0.1:$localPort"
if ($LASTEXITCODE -ne 0) {
    Write-Host '[RegChula] Tailscale Funnel could not be enabled. Complete any approval link shown above, then run start-public.bat again.'
    exit $LASTEXITCODE
}

Write-Host "[RegChula] Public site: $publicOrigin"
Write-Host '[RegChula] Anyone with this URL can reach the mock site while this PC, Docker Desktop, Kubernetes, and Tailscale remain running.'
Write-Host '[RegChula] Run stop-public.bat to close public access without stopping the site, or stop.bat to close access and stop all workloads.'
