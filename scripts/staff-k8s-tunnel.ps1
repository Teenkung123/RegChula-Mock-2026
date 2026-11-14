param([switch]$Stop)

$ErrorActionPreference = 'Stop'
$kubectl = (Get-Command kubectl.exe -ErrorAction Stop).Source
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5174 -ErrorAction SilentlyContinue)
$tunnels = @()
foreach ($ownerId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    $command = $process.CommandLine
    $matchesTunnel = $process.ExecutablePath -eq $kubectl -and
        $command -match '\s--context=docker-desktop(?:\s|$)' -and
        $command -match '\s-n\s+regchula(?:\s|$)' -and
        $command -match '\sport-forward\s+service/regchula-staff\s+5174:80(?:\s|$)' -and
        $command -match '\s--address\s+127\.0\.0\.1(?:\s|$)'
    if (-not $matchesTunnel) {
        if ($Stop) { continue }
        throw "Port 5174 belongs to another process (PID $ownerId)."
    }
    $tunnels += $process
}

if ($Stop) {
    foreach ($tunnel in $tunnels) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($tunnel.ProcessId)"
        if ($current -and $current.CreationDate -eq $tunnel.CreationDate -and $current.CommandLine -eq $tunnel.CommandLine) {
            Stop-Process -Id $current.ProcessId -ErrorAction Stop
        }
    }
    exit 0
}

if ($tunnels.Count -eq 0) {
    $arguments = @('--context=docker-desktop', '-n', 'regchula', 'port-forward', 'service/regchula-staff', '5174:80', '--address', '127.0.0.1')
    $tunnel = Start-Process -FilePath $kubectl -ArgumentList $arguments -WindowStyle Hidden -PassThru
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5174' -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200 -and $response.Content -match '<title>RegChula . Staff</title>') {
            Write-Host '[RegChula] Staff portal is available on http://localhost:5174.'
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
throw 'The staff portal did not become ready.'
