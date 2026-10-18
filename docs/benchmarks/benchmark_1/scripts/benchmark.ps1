param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    "coverage",
    "catalog-matrix",
    "registration-day-175",
    "registration-day-188",
    "registration-day-194",
    "registration-day-200",
    "all-features-15",
    "all-features-20",
    "concurrent-8000",
    "concurrent-9000",
    "concurrent-10000",
    "capacity-ladder"
  )]
  [string]$Profile,
  [switch]$Record
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
New-Item -ItemType Directory -Force -Path "tmp\benchmarks" | Out-Null

$scriptPath = switch ($Profile) {
  "coverage" { "tests/load/global.yml" }
  "catalog-matrix" { "tests/load/catalog-matrix.yml" }
  "registration-day-175" { "tests/load/capacity.yml" }
  "registration-day-188" { "tests/load/capacity.yml" }
  "registration-day-194" { "tests/load/capacity.yml" }
  "registration-day-200" { "tests/load/capacity.yml" }
  "all-features-15" { "tests/load/global.yml" }
  "all-features-20" { "tests/load/global.yml" }
  "concurrent-8000" { "tests/load/concurrent-10000.yml" }
  "concurrent-9000" { "tests/load/concurrent-10000.yml" }
  "concurrent-10000" { "tests/load/concurrent-10000.yml" }
  "capacity-ladder" { "tests/load/capacity.yml" }
}

$planned = switch ($Profile) {
  "registration-day-175" { 5250 }
  "registration-day-188" { 5640 }
  "registration-day-194" { 5820 }
  "registration-day-200" { 6000 }
  "all-features-15" { 450 }
  "all-features-20" { 600 }
  default { $null }
}

$override = $null
if ($Profile -like "registration-day-*" -or $Profile -like "all-features-*") {
  $rate = [int]($Profile -replace '^.*-', '')
  $override = @{
    config = @{
      phases = @(
        @{
          name = $Profile
          duration = 30
          arrivalRate = $rate
          maxVusers = 5000
        }
      )
      ensure = @{
        maxErrorRate = 1
        thresholds = @(@{ "http.response_time.p95" = 3000 })
        conditions = @(
          @{ expression = "vusers.created == $planned" }
          @{ expression = "vusers.created == vusers.completed" }
          @{ expression = "http.codes.200 == http.responses" }
        )
      }
    }
  } | ConvertTo-Json -Depth 8 -Compress
} elseif ($Profile -eq "concurrent-8000" -or $Profile -eq "concurrent-9000") {
  $users = if ($Profile -eq "concurrent-8000") { 8000 } else { 9000 }
  $override = @{
    config = @{
      phases = @(
        @{
          name = $Profile
          duration = 60
          arrivalCount = $users
          maxVusers = $users + 2000
        }
      )
      ensure = @{
        maxErrorRate = 1
        thresholds = @(@{ "http.response_time.p95" = 3000 })
        conditions = @(
          @{ expression = "vusers.created == $users" }
          @{ expression = "vusers.created == vusers.completed" }
          @{ expression = "http.codes.200 == http.responses" }
        )
      }
    }
  } | ConvertTo-Json -Depth 8 -Compress
}

$artilleryArgs = @("run", $scriptPath)
if ($override) {
  $artilleryArgs += @("--overrides", $override)
}
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artilleryArgs += @("--output", "tmp/benchmarks/$Profile-$timestamp.json")
if ($Record) {
  $command = Get-Content -Raw -LiteralPath "artillery.txt"
  $match = [regex]::Match($command, "--key\s+(\S+)")
  if (!$match.Success) {
    throw "Artillery API key argument not found in artillery.txt"
  }
  $artilleryArgs += @("--record", "--key", $match.Groups[1].Value)
}

& bun run benchmark:prepare
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$exitCode = 1
try {
  & artillery @artilleryArgs
  $exitCode = $LASTEXITCODE
} finally {
  & bun run benchmark:cleanup
  if ($LASTEXITCODE -ne 0 -and $exitCode -eq 0) {
    $exitCode = $LASTEXITCODE
  }
  & bun run test:load:verify
  if ($LASTEXITCODE -ne 0 -and $exitCode -eq 0) {
    $exitCode = $LASTEXITCODE
  }
}

exit $exitCode
