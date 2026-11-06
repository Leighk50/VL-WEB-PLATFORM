param(
 [Parameter(Mandatory=$true)][string]$UnsignedZip,
 [string]$Version = '1.2.14',
 [string]$Profile = 'VillageLimits'
)
$ErrorActionPreference='Stop'
$cli='C:\tizen-studio\tools\ide\bin\tizen.bat'
if (!(Test-Path $cli)) { throw 'Tizen CLI not found.' }
if (!(Test-Path $UnsignedZip)) { throw "Missing ZIP: $UnsignedZip" }
$root=Join-Path $env:USERPROFILE 'workspace\VillageLimits\releases'
$release=Join-Path $root $Version
if (Test-Path $release) { throw "Release directory already exists: $release. Nothing overwritten." }
New-Item -ItemType Directory -Path $release -Force | Out-Null
$project=Join-Path $release 'project'
New-Item -ItemType Directory -Path $project | Out-Null
Expand-Archive -LiteralPath $UnsignedZip -DestinationPath $project
$config=Join-Path $project 'config.xml'
if (!(Test-Path $config)) { throw 'Missing config.xml; check ZIP folder structure.' }
[xml]$xml=Get-Content $config -Raw
$apps=$xml.GetElementsByTagName('application','http://tizen.org/ns/widgets')
if ($apps.Count -ne 1 -or $apps[0].GetAttribute('id') -ne 'VLRoomTest.RoomTest' -or $apps[0].GetAttribute('package') -ne 'VLRoomTest') { throw 'App identity mismatch; refusing to sign.' }
if ($xml.DocumentElement.GetAttribute('version') -ne $Version) { throw 'Version mismatch; refusing to sign.' }
Get-ChildItem $project -Recurse -File -Include 'author-signature.xml','signature1.xml' | Remove-Item -Force
& $cli package -t wgt -s $Profile -- $project
if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
$wgt=Get-ChildItem $project -Filter '*.wgt' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$wgt) { throw 'Signed widget not found.' }
$out=Join-Path $release "VillageLimits-$Version-SIGNED.wgt"
Copy-Item $wgt.FullName $out
$hash=(Get-FileHash $out -Algorithm SHA256).Hash
"Version: $Version`nPackage: $out`nSHA256: $hash`nBytes: $((Get-Item $out).Length)" | Set-Content (Join-Path $release 'release-check.txt')
Write-Host "Signed and verified locally: $out"
Write-Host "SHA256: $hash"
Write-Host 'NOT PUBLISHED. Live installer and TVs unchanged.'
