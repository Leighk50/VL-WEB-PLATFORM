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
  # Azure staging test queue: separate service token, no browser credential.
  $credentialPath = Join-Path $Root 'service-token.dpapi'
  if (Test-Path -LiteralPath $credentialPath) {
    try {
      $cipher = [Convert]::FromBase64String([System.IO.File]::ReadAllText($credentialPath).Trim())
      $raw = [System.Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[System.Security.Cryptography.DataProtectionScope]::LocalMachine)
      $token = [System.Text.Encoding]::UTF8.GetString($raw)
      $headers = @{Authorization=('Bearer '+$token)}
      $base = 'https://vl-epos-staging-cngrfug6feewdmey.ukwest-01.azurewebsites.net'
      $response = Invoke-RestMethod -Uri ($base+'/api/print/claim') -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 15
      if ($null -ne $response.job) {
        $id = [string]$response.job.id
        if ($id -notmatch '^[0-9a-f-]{36}
) { throw 'Invalid Azure print job ID' }
        $jobPath = Join-Path $processing ('azure-'+$id+'.json')
        [System.IO.File]::WriteAllText($jobPath,($response.job | ConvertTo-Json -Depth 5))
        $outcome = 'review'
        try {
          if ($response.job.jobType -ne 'test' -or $response.job.payload.type -ne 'local-test' -or $response.job.payload.siteId -ne 'VL') { throw 'Unsupported Azure job' }
          $receipt = "LINDUS EPOS`r`nTHE VILLAGE LIMITS`r`n`r`nAZURE QUEUE TEST`r`nTILL-03 MASTER`r`n`r`n"
          $client = [System.Net.Sockets.TcpClient]::new()
          try {
            $client.Connect($ip,$port)
            $stream=$client.GetStream()
            [byte[]]$init=@(27,64);$stream.Write($init,0,$init.Length)
            $bytes=[System.Text.Encoding]::ASCII.GetBytes($receipt);$stream.Write($bytes,0,$bytes.Length)
            [byte[]]$cut=@(27,100,4,29,86,66,0);$stream.Write($cut,0,$cut.Length)
            $stream.Flush()
            $outcome='printed'
          } finally { $client.Dispose() }
        } catch { Log ('Azure print uncertain '+$id+': '+$_.Exception.Message) }
        try {
          Invoke-RestMethod -Uri ($base+'/api/print/complete') -Method Post -Headers $headers -ContentType 'application/json' -Body (@{id=$id;outcome=$outcome}|ConvertTo-Json) -TimeoutSec 15 | Out-Null
          Move-Item -LiteralPath $jobPath -Destination (Join-Path $(if($outcome -eq 'printed'){$printed}else{$review}) ('azure-'+$id+'.json'))
          Log ('Azure job '+$id+' outcome '+$outcome)
        } catch {
          # Acknowledgement uncertain: leave journal in processing; never print again automatically.
          Log ('Azure acknowledgement uncertain '+$id+': '+$_.Exception.Message)
        }
      }
    } catch { Log ('Azure polling error: '+$_.Exception.Message) }
  }
  Start-Sleep -Seconds 2
}
