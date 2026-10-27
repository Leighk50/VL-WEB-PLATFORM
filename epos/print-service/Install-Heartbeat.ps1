# Run from an elevated Windows PowerShell prompt on TILL-03.
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramData 'Lindus\PrintService'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$worker = Join-Path $root 'Heartbeat.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Leighk50/VL-WEB-PLATFORM/feature/epos-catalogue-v01/epos/print-service/Heartbeat.ps1' -OutFile $worker
$taskName = 'Lindus Print Service Staging'
$exe = Join-Path $PSHOME 'powershell.exe'
$action = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '"')
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
