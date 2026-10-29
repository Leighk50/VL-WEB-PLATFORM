param(
 [string]$PrinterIP = '192.168.0.192',
 [int]$Port = 9100,
 [int]$TimeoutMs = 2500
)
$ErrorActionPreference='Stop'
$client=[System.Net.Sockets.TcpClient]::new()
$async=$null
try {
 $async=$client.BeginConnect($PrinterIP,$Port,$null,$null)
 if(-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)){
  Write-Output 'CONNECTION: OFFLINE_OR_UNREACHABLE'
  exit 2
 }
 $client.EndConnect($async)
 Write-Output 'CONNECTION: ACCEPTING_TCP'
 $stream=$client.GetStream()
 $stream.ReadTimeout=$TimeoutMs
 $stream.WriteTimeout=$TimeoutMs
 # ESC/POS DLE EOT 1: real-time printer status.
 [byte[]]$query=@(16,4,1)
 $stream.Write($query,0,$query.Length)
 $stream.Flush()
 try {
  $reply=$stream.ReadByte()
  if($reply -lt 0){throw 'No status byte'}
  Write-Output ('STATUS_BYTE: 0x{0:X2}' -f $reply)
  if(($reply -band 8) -ne 0){
   Write-Output 'PRINTER_STATUS: OFFLINE'
  } else {
   Write-Output 'PRINTER_STATUS: ONLINE'
  }
  Write-Output 'NOTE: This status does not prove a ticket physically printed.'
 } catch {
  Write-Output 'PRINTER_STATUS: UNKNOWN (network port accepts TCP but no ESC/POS status response)'
  Write-Output 'NOTE: Some Ethernet adapters do not return status bytes.'
 }
} catch {
 Write-Output ('CONNECTION: FAILED ('+$_.Exception.GetType().Name+')')
 exit 2
} finally {
 if($async -and $async.AsyncWaitHandle){$async.AsyncWaitHandle.Close()}
 $client.Dispose()
}
