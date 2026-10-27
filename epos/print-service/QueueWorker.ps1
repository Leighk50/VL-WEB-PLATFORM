param([string]$Root = 'C:\ProgramData\Lindus\PrintService')
$ErrorActionPreference = 'Stop'
$ip = '192.168.0.175'
$port = 9100
$pending = Join-Path $Root 'pending'
$processing = Join-Path $Root 'processing'
$printed = Join-Path $Root 'printed'
$review = Join-Path $Root 'review'
foreach ($dir in @($Root,$pending,$processing,$printed,$review)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
$heartbeat = Join-Path $Root 'heartbeat.txt'
$log = Join-Path $Root 'print-service.log'
function Log([string]$message) {
  Add-Content -LiteralPath $log -Value ("{0:o} {1}" -f [DateTime]::UtcNow,$message)
}
Log 'Local queue worker started; staging test jobs only.'
# A job in processing after a crash is ambiguous: never replay it automatically.
foreach ($orphan in @(Get-ChildItem -LiteralPath $processing -Filter '*.json' -File)) {
  Move-Item -LiteralPath $orphan.FullName -Destination (Join-Path $review $orphan.Name) -ErrorAction SilentlyContinue
}
while ($true) {
  [System.IO.File]::WriteAllText($heartbeat,[DateTime]::UtcNow.ToString('o'))
  foreach ($jobFile in @(Get-ChildItem -LiteralPath $pending -Filter '*.json' -File | Sort-Object Name)) {
    $claimed = Join-Path $processing $jobFile.Name
    try { Move-Item -LiteralPath $jobFile.FullName -Destination $claimed -ErrorAction Stop }
    catch { continue }
    try {
      $job = Get-Content -LiteralPath $claimed -Raw | ConvertFrom-Json -ErrorAction Stop
      if ($job.type -ne 'local-test' -or $job.siteId -ne 'VL' -or $job.deviceId -ne 'TILL-03') {
        throw 'Unsupported job (only VL TILL-03 local-test is permitted)'
      }
      $receipt = "LINDUS EPOS`r`nTHE VILLAGE LIMITS`r`n`r`nLOCAL QUEUE TEST`r`nTILL-03 MASTER`r`n`r`n"
      $client = [System.Net.Sockets.TcpClient]::new()
      try {
        $client.Connect($ip,$port)
        $stream = $client.GetStream()
        [byte[]]$init = @(27,64)
        $stream.Write($init,0,$init.Length)
        $data = [System.Text.Encoding]::ASCII.GetBytes($receipt)
        $stream.Write($data,0,$data.Length)
        [byte[]]$cut = @(27,100,4,29,86,66,0)
        $stream.Write($cut,0,$cut.Length)
        $stream.Flush()
      } finally { $client.Dispose() }
      Move-Item -LiteralPath $claimed -Destination (Join-Path $printed $jobFile.Name) -ErrorAction Stop
      Log ('Sent job to printer: '+$jobFile.Name)
    } catch {
      Log ('Outcome unknown; manual review required for '+$jobFile.Name+': '+$_.Exception.Message)
      if (Test-Path -LiteralPath $claimed) {
        Move-Item -LiteralPath $claimed -Destination (Join-Path $review $jobFile.Name) -ErrorAction SilentlyContinue
      }
    }
  }
  Start-Sleep -Seconds 2
}
