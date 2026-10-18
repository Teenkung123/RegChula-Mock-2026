param(
  [ValidateRange(1,500)][int]$Rate,
  [ValidateRange(10,120)][int]$Duration=30,
  [ValidateSet('capacity','lifecycle')][string]$Workload='capacity'
)
. "$PSScriptRoot/environment.ps1"
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
$name = "k8s-$Workload-$Rate-$Duration-$stamp"
$folder = 'tmp/benchmarks/kubernetes-20260908'
$source = if ($Workload -eq 'capacity') {'tests/load/capacity.yml'} else {'tests/load/global.yml'}
$scenario = "$folder/$name.yml"
(Get-Content $source -Raw).Replace('http://127.0.0.1:5173/','http://127.0.0.1:5174/') | Set-Content $scenario
$planned = $Rate * $Duration
$override = @{config=@{phases=@(@{name=$name;duration=$Duration;arrivalRate=$Rate;maxVusers=5000});ensure=@{maxErrorRate=1;thresholds=@(@{'http.response_time.p95'=3000});conditions=@(@{expression="vusers.created == $planned"},@{expression='vusers.created == vusers.completed'},@{expression='http.codes.200 == http.responses'})}}} | ConvertTo-Json -Depth 10 -Compress
$keyMatch = [regex]::Match((Get-Content artillery.txt -Raw), '--key\s+(\S+)')
if (!$keyMatch.Success) { throw 'Artillery key not found' }
$log = "$folder/$name.log"
& bun run benchmark:prepare *> $log
if ($LASTEXITCODE -ne 0) { throw "Fixture preparation failed: $log" }
$exitCode=1
try {
  $selection = if ($Workload -eq 'lifecycle') { @('--scenario-name','complete-student-lifecycle') } else { @() }
  & artillery run $scenario --target http://127.0.0.1:5174 --overrides $override --output "tmp/benchmarks/$name.json" --name $name --record --key $keyMatch.Groups[1].Value @selection *>> $log
  $exitCode=$LASTEXITCODE
} finally {
  & bun run benchmark:cleanup *>> $log
  if ($LASTEXITCODE -ne 0) { $exitCode=1 }
  & bun run test:load:verify *>> $log
  if ($LASTEXITCODE -ne 0) { $exitCode=1 }
}
Write-Output "Run $name exited $exitCode; log $log"
Get-Content $log -Tail 35
exit $exitCode
