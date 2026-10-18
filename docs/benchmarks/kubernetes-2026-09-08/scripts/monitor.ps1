$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath D:\RegChula
$nodes = @('desktop-worker', 'desktop-worker2', 'desktop-worker3')
for ($sample = 0; $sample -lt 180; $sample++) {
  $now = (Get-Date).ToUniversalTime().ToString('o')
  foreach ($node in $nodes) {
    try {
      $summary = kubectl --context=docker-desktop --request-timeout=5s get --raw "/api/v1/nodes/$node/proxy/stats/summary" | ConvertFrom-Json
      if ($LASTEXITCODE -ne 0) { throw 'Kubelet stats unavailable' }
      foreach ($pod in $summary.pods | Where-Object { $_.podRef.namespace -eq 'regchula' }) {
        @{time=$now;node=$node;pod=$pod.podRef.name;cpuMillicores=$pod.cpu.usageNanoCores/1000000;memoryMiB=$pod.memory.workingSetBytes/1MB} | ConvertTo-Json -Compress | Add-Content tmp/benchmarks/kubernetes-20260908/resources.jsonl
      }
    } catch {
      @{time=$now;node=$node;error=$_.Exception.Message} | ConvertTo-Json -Compress | Add-Content tmp/benchmarks/kubernetes-20260908/resources.jsonl
    }
  }
  Start-Sleep -Seconds 5
}
