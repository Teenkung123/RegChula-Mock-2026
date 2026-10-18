param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    "coverage",
    "catalog-matrix",
    "registration-day-25",
    "registration-day-50",
    "registration-day-75",
    "registration-day-100",
    "registration-day-125",
    "registration-day-150",
    "registration-day-175",
    "registration-day-188",
    "registration-day-194",
    "registration-day-200",
    "all-features-15",
    "all-features-20",
    "concurrent-8000",
    "concurrent-9000",
    "concurrent-10000",
    "concurrent-10000-stability",
    "capacity-ladder"
  )]
  [string]$Profile,
  [string]$Target = "http://127.0.0.1:3000",
  [switch]$Record
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
New-Item -ItemType Directory -Force -Path "tmp\benchmarks" | Out-Null

$scriptPath = switch ($Profile) {
  "coverage" { "tests/load/global.yml" }
  "catalog-matrix" { "tests/load/catalog-matrix.yml" }
  "registration-day-25" { "tests/load/capacity.yml" }
  "registration-day-50" { "tests/load/capacity.yml" }
  "registration-day-75" { "tests/load/capacity.yml" }
  "registration-day-100" { "tests/load/capacity.yml" }
  "registration-day-125" { "tests/load/capacity.yml" }
  "registration-day-150" { "tests/load/capacity.yml" }
  "registration-day-175" { "tests/load/capacity.yml" }
  "registration-day-188" { "tests/load/capacity.yml" }
  "registration-day-194" { "tests/load/capacity.yml" }
  "registration-day-200" { "tests/load/capacity.yml" }
  "all-features-15" { "tests/load/global.yml" }
  "all-features-20" { "tests/load/global.yml" }
  "concurrent-8000" { "tests/load/concurrent-10000.yml" }
  "concurrent-9000" { "tests/load/concurrent-10000.yml" }
  "concurrent-10000" { "tests/load/concurrent-10000.yml" }
  "concurrent-10000-stability" { "tests/load/concurrent-10000.yml" }
  "capacity-ladder" { "tests/load/capacity.yml" }
}

$planned = switch ($Profile) {
  "registration-day-25" { 750 }
  "registration-day-50" { 1500 }
  "registration-day-75" { 2250 }
  "registration-day-100" { 3000 }
  "registration-day-125" { 3750 }
  "registration-day-150" { 4500 }
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
} elseif ($Profile -like "concurrent-*") {
  $users = switch ($Profile) {
    "concurrent-8000" { 8000 }
    "concurrent-9000" { 9000 }
    default { 10000 }
  }
  $polls = if ($Profile -eq "concurrent-10000-stability") { 20 } else { 6 }
  $baseRate = [int][math]::Floor($users / 60)
  $remainder = $users % 60
  $phases = @(@{name="$Profile-a";duration=60-$remainder;arrivalRate=$baseRate;maxVusers=$users+2000})
  if ($remainder) {
    $phases += @{name="$Profile-b";duration=$remainder;arrivalRate=$baseRate+1;maxVusers=$users+2000}
  }
  $expectedRequests = $users * ($polls + 5)
  $override = @{
    config = @{
      phases = $phases
      variables = @{ sessionPolls = $polls }
      ensure = @{
        maxErrorRate = 1
        thresholds = @(@{ "http.response_time.p95" = 3000 })
        conditions = @(
          @{ expression = "vusers.created == $users" }
          @{ expression = "vusers.created == vusers.completed" }
          @{ expression = "http.codes.200 == http.responses" }
          @{ expression = "http.requests == $expectedRequests" }
          @{ expression = "http.codes.200 == $expectedRequests" }
          @{ expression = "validation.identity_matched == $($users * 2)" }
        )
      }
    }
  } | ConvertTo-Json -Depth 8 -Compress
}

$artilleryArgs = @("run", $scriptPath, "--target", $Target)
if ($override) {
  $artilleryArgs += @("--overrides", $override)
}
$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss", [Globalization.CultureInfo]::InvariantCulture)
$reportPath = "tmp/benchmarks/$Profile-$timestamp.json"
$artilleryArgs += @("--output", $reportPath)
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
  if ($exitCode -eq 0 -and $Profile -like "concurrent-*") {
    $minimumOverlap = if ($Profile -eq "concurrent-10000-stability") { 180 } else { 10 }
    & "$PSScriptRoot/verify-concurrent-report.ps1" -Path $reportPath -Users $users -MinimumOverlapSeconds $minimumOverlap
  }
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
