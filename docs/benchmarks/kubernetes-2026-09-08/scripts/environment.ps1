$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath D:\RegChula
foreach ($line in Get-Content -LiteralPath .env.k8s.local) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
$env:DATABASE_URL = $env:DATABASE_URL -replace '@regchula-mysql:3306/', '@127.0.0.1:3307/'
$env:REDIS_URL = $env:REDIS_URL -replace '@regchula-redis:6379', '@127.0.0.1:6381'
$env:API_HOST = '127.0.0.1'
$bunPath = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Oven-sh.Bun_*\bun-windows-x64\bun.exe" | Select-Object -First 1 -ExpandProperty FullName
if (!$bunPath) { throw 'Pinned Bun executable not found' }
$env:PATH = "$(Split-Path -Parent $bunPath);$env:PATH"
if ((& bun --version) -ne '1.3.14') { throw 'Bun version mismatch' }
