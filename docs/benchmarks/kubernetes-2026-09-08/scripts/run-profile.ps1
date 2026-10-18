param([Parameter(Mandatory=$true)][string]$Profile)
. "$PSScriptRoot/environment.ps1"
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$log = "tmp/benchmarks/kubernetes-20260908/$Profile-$stamp.log"
& ./scripts/benchmark.ps1 -Profile $Profile -Target http://127.0.0.1:5174 -Record *> $log
$result = $LASTEXITCODE
Write-Output "Profile $Profile exited $result; log $log"
Get-Content $log -Tail 35
exit $result
