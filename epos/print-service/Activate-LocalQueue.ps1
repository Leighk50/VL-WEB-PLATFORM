# Run as Administrator on TILL-03. Replaces only the existing Lindus staging heartbeat task.
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'Lindus\PrintService'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$worker=Join-Path $root 'QueueWorker.ps1'
$url='https://raw.githubusercontent.com/Leighk50/VL-WEB-PLATFORM/feature/epos-catalogue-v01/epos/print-service/QueueWorker.ps1'
Invoke-WebRequest -Uri $url -OutFile $worker
$task='Lindus Print Service Staging'
$existing=Get-ScheduledTask -TaskName $task -ErrorAction Stop
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
$exe=Join-Path $PSHOME 'powershell.exe'
$action=New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$worker+'"')
Set-ScheduledTask -TaskName $task -Action $action | Out-Null
Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName $task | Select-Object TaskName,State
Get-Content (Join-Path $root 'heartbeat.txt')
