param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][int]$Users,
  [int]$MinimumOverlapSeconds = 10
)
$ErrorActionPreference = "Stop"
$report = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
$created = 0; $completed = 0; $failed = 0; $logins = 0; $peak = 0
$fullPeriods = @()
foreach ($interval in $report.intermediate | Sort-Object { [long]$_.period }) {
  $counters = $interval.counters
  $created += [int]$counters.'vusers.created'
  $completed += [int]$counters.'vusers.completed'
  $failed += [int]$counters.'vusers.failed'
  $logins += [int]$counters.'plugins.metrics-by-endpoint./api/v1/auth/login (auth-login).codes.200'
  $active = [math]::Max(0, $logins - $completed - $failed)
  $peak = [math]::Max($peak, $active)
  if ($active -eq $Users) { $fullPeriods += [long]$interval.period }
}
$aggregate = $report.aggregate.counters
if ($created -ne $aggregate.'vusers.created' -or $completed -ne $aggregate.'vusers.completed' -or
    $failed -ne $aggregate.'vusers.failed' -or
    $logins -ne $aggregate.'plugins.metrics-by-endpoint./api/v1/auth/login (auth-login).codes.200') {
  throw "Concurrent report interval counters do not reconcile"
}
$span = if ($fullPeriods.Count -gt 1) { ($fullPeriods[-1] - $fullPeriods[0]) / 1000 } else { 0 }
$transportErrors = ($aggregate.PSObject.Properties | Where-Object Name -Like 'errors.*' | Measure-Object Value -Sum).Sum
$passed = $created -eq $Users -and $completed -eq $Users -and $logins -eq $Users -and $failed -eq 0 -and
  [int]$aggregate.'vusers.skipped' -eq 0 -and !$transportErrors -and
  $aggregate.'http.requests' -eq $aggregate.'http.responses' -and
  $aggregate.'http.codes.200' -eq $aggregate.'http.responses' -and
  $peak -eq $Users -and $span -ge $MinimumOverlapSeconds
$result = [pscustomobject]@{
  plannedUsers=$Users; peakAuthenticated=$peak; fullOverlapSamples=$fullPeriods.Count
  fullOverlapSpanSeconds=$span; requiredOverlapSeconds=$MinimumOverlapSeconds; passed=$passed
}
$result | ConvertTo-Json | Set-Content -LiteralPath ([IO.Path]::ChangeExtension($Path, 'overlap.json'))
if (!$passed) { throw "Concurrent overlap gate failed: peak $peak/$Users; full overlap $span seconds; failures $failed" }
Write-Output "[concurrency] $peak authenticated users overlap across $span seconds of sampled boundaries; all users completed without errors"
