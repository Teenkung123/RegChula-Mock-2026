$folder='D:/RegChula/tmp/benchmarks/kubernetes-concurrent-20260908'
$rows=foreach ($file in Get-ChildItem "$folder/k8s-concurrent-*.json" | Where-Object { $_.Name -notlike '*.overrides.json' -and $_.Name -notlike '*.timeline.json' }) {
  $r=Get-Content $file.FullName -Raw | ConvertFrom-Json
  if ($r.PSObject.Properties.Name -notcontains 'aggregate') { continue }
  $created=0; $completed=0; $failed=0; $logins=0; $maxActive=0; $maxAuthenticated=0; $fullSamples=0
  $planned=[int]([regex]::Match($file.Name,'concurrent-(\d+)-').Groups[1].Value)
  $timeline=foreach ($i in $r.intermediate | Sort-Object {[long]$_.period}) {
    $c=$i.counters
    $created += [int]$c.'vusers.created'
    $completed += [int]$c.'vusers.completed'
    $failed += [int]$c.'vusers.failed'
    $logins += [int]$c.'plugins.metrics-by-endpoint./api/v1/auth/login (auth-login).codes.200'
    $active=$created-$completed-$failed
    $authenticated=[math]::Max(0,$logins-$completed-$failed)
    $maxActive=[math]::Max($maxActive,$active)
    $maxAuthenticated=[math]::Max($maxAuthenticated,$authenticated)
    if ($authenticated -eq $planned) { $fullSamples++ }
    [pscustomobject]@{period=[long]$i.period;created=$created;completed=$completed;failed=$failed;login200=$logins;active=$active;authenticatedLowerBound=$authenticated;httpRequests=[int]$c.'http.requests';requestsPerSecondIn10sBucket=([int]$c.'http.requests'/10);p95=$i.summaries.'http.response_time'.p95}
  }
  $timeline | ConvertTo-Json -Depth 4 | Set-Content "$folder/$($file.BaseName).timeline.json"
  $a=$r.aggregate; $c=$a.counters
  if ($created -ne $c.'vusers.created' -or $completed -ne $c.'vusers.completed' -or $logins -ne $c.'plugins.metrics-by-endpoint./api/v1/auth/login (auth-login).codes.200') { throw "Interval counters do not reconcile: $($file.Name)" }
  $errorTotal=($c.PSObject.Properties | Where-Object Name -Like 'errors.*' | Measure-Object Value -Sum).Sum
  $strict=($c.'vusers.created' -eq $planned -and $c.'vusers.completed' -eq $planned -and [int]$c.'vusers.failed' -eq 0 -and [int]$c.'vusers.skipped' -eq 0 -and !$errorTotal -and $c.'http.codes.200' -eq ($planned*10) -and $c.'http.requests' -eq ($planned*10) -and $c.'http.responses' -eq $c.'http.codes.200' -and $a.summaries.'http.response_time'.p95 -lt 3000 -and $maxAuthenticated -eq $planned)
  $cloud=Select-String -LiteralPath "$folder/$($file.BaseName).log" -Pattern '^Run URL: (https://app.artillery.io/\S+)' | Select-Object -Last 1
  [pscustomobject]@{file=$file.Name;planned=$planned;created=$c.'vusers.created';completed=$c.'vusers.completed';failed=$c.'vusers.failed';http200=$c.'http.codes.200';responses=$c.'http.responses';p95=$a.summaries.'http.response_time'.p95;p99=$a.summaries.'http.response_time'.p99;minSessionMs=$a.summaries.'vusers.session_length'.min;peakActive=$maxActive;peakAuthenticatedLowerBound=$maxAuthenticated;fullOverlapSamples=$fullSamples;peak10sRequestsPerSecond=($timeline.requestsPerSecondIn10sBucket | Measure-Object -Maximum).Maximum;strictPass=$strict;errors=($c.PSObject.Properties | Where-Object { $_.Name -match '^errors\.|^http.codes\.(?!200)' } | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; ';cloudUrl=$cloud.Matches[0].Groups[1].Value}
}
$rows | ConvertTo-Json -Depth 5 | Set-Content "$folder/summary.json"
$rows | Format-Table planned,completed,failed,http200,p95,peakAuthenticatedLowerBound,fullOverlapSamples,peak10sRequestsPerSecond,strictPass -AutoSize
