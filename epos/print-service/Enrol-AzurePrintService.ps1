# Run elevated on TILL-03 only, after migration 011 and staging deployment.
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'Lindus\PrintService'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$secret=Read-Host 'Enter staging manager API key (not displayed)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 $response=Invoke-RestMethod -Uri 'https://vl-epos-staging-cngrfug6feewdmey.ukwest-01.azurewebsites.net/api/print-service/enrol' -Method Post -Headers @{'x-epos-staging-key'=$plain} -ContentType 'application/json' -Body '{}' -TimeoutSec 20
 if($response.deviceId -ne 'TILL-03'){throw 'Unexpected master device identity'}
 Add-Type -AssemblyName System.Security -ErrorAction Stop
 $bytes=[System.Text.Encoding]::UTF8.GetBytes([string]$response.token)
 $cipher=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::LocalMachine)
 $path=Join-Path $root 'service-token.dpapi'
 [System.IO.File]::WriteAllText($path,[Convert]::ToBase64String($cipher))
 & icacls.exe $path /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' | Out-Null
 Write-Host 'Master print service credential stored encrypted on TILL-03.'
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 Remove-Variable plain,secret -ErrorAction SilentlyContinue
}
