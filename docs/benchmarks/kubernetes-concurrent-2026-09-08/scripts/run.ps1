param([Parameter(Mandatory=$true)][ValidateRange(1,15000)][int]$Users,[switch]$Distributed)
. 'D:/RegChula/tmp/benchmarks/kubernetes-20260908/environment.ps1'
$stamp=(Get-Date).ToString('yyyyMMdd-HHmmss',[Globalization.CultureInfo]::InvariantCulture)
$folder='tmp/benchmarks/kubernetes-concurrent-20260908'
$name="k8s-concurrent-$Users-$stamp"
if ($Distributed) { $name="k8s-concurrent-$Users-distributed-$stamp" }
$scenario="$folder/$name.yml"
Copy-Item -LiteralPath tests/load/concurrent-10000.yml -Destination $scenario
$phases=@(@{name=$name;duration=60;arrivalCount=$Users;maxVusers=$Users+2000})
if ($Distributed) {
  if ($Users -lt 60) { throw 'Distributed profiles require at least 60 users' }
  $baseRate=[int][math]::Floor($Users/60)
  $remainder=$Users%60
  $phases=@(@{name="$name-a";duration=60-$remainder;arrivalRate=$baseRate;maxVusers=$Users+2000})
  if ($remainder) { $phases+=@{name="$name-b";duration=$remainder;arrivalRate=$baseRate+1;maxVusers=$Users+2000} }
  $expected=($phases | ForEach-Object {$_.duration*$_.arrivalRate} | Measure-Object -Sum).Sum
  if ($expected -ne $Users) { throw 'Distributed arrival total mismatch' }
}
$override=@{config=@{phases=$phases;http=@{defaults=@{think=@{jitter=0}}};ensure=@{maxErrorRate=1;thresholds=@(@{'http.response_time.p95'=3000});conditions=@(@{expression="vusers.created == $Users"},@{expression='vusers.created == vusers.completed'},@{expression='http.codes.200 == http.responses'},@{expression="http.codes.200 == $($Users*10)"})}}} | ConvertTo-Json -Depth 12 -Compress
$override | Set-Content "$folder/$name.overrides.json"
$key=[regex]::Match((Get-Content artillery.txt -Raw),'--key\s+(\S+)')
if (!$key.Success) { throw 'Artillery key not found' }
$log="$folder/$name.log"
& bun run benchmark:prepare *> $log
if ($LASTEXITCODE -ne 0) { throw "Fixture preparation failed: $log" }
$exitCode=1
try {
  & artillery run $scenario --target http://127.0.0.1:5174 --overrides $override --output "$folder/$name.json" --name $name --record --key $key.Groups[1].Value *>> $log
  $exitCode=$LASTEXITCODE
} finally {
  & bun run benchmark:cleanup *>> $log
  if ($LASTEXITCODE -ne 0) { $exitCode=1 }
  & bun run test:load:verify *>> $log
  if ($LASTEXITCODE -ne 0) { $exitCode=1 }
}
Write-Output "Concurrent run $Users exited $exitCode; log $log"
Get-Content $log -Tail 36
exit $exitCode
