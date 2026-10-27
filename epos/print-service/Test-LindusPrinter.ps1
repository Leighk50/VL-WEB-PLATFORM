param(
 [string]$PrinterIP = "192.168.0.175",
 [int]$PrinterPort = 9100
)
$ErrorActionPreference = "Stop"
$client = [System.Net.Sockets.TcpClient]::new()
try {
 $client.Connect($PrinterIP,$PrinterPort)
 $stream=$client.GetStream()
 [byte[]]$initialize=@(27,64)
 $stream.Write($initialize,0,$initialize.Length)
 $text="LINDUS EPOS`r`nTHE VILLAGE LIMITS`r`n`r`nLOCAL PRINT SERVICE TEST`r`nMaster Till: TILL-03`r`nPrinter: $PrinterIP`r`n`r`n"
 $bytes=[System.Text.Encoding]::ASCII.GetBytes($text)
 $stream.Write($bytes,0,$bytes.Length)
 [byte[]]$cut=@(27,100,4,29,86,66,0)
 $stream.Write($cut,0,$cut.Length)
 $stream.Flush()
 Write-Host "Test receipt sent successfully to $PrinterIP"
} finally { $client.Dispose() }
