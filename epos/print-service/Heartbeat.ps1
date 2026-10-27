param([string]$Root = 'C:\ProgramData\Lindus\PrintService')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$heartbeat = Join-Path $Root 'heartbeat.txt'
while ($true) {
  [System.IO.File]::WriteAllText($heartbeat, (Get-Date).ToUniversalTime().ToString('o'))
  Start-Sleep -Seconds 15
}
