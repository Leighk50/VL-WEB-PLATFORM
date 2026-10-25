param(
    [string]$Project = 'C:\Users\Leigh.TGM\workspace\VillageLimits',
    [string]$CertificateProfile = 'VillageLimits'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$configPath = Join-Path $Project 'config.xml'
if (!(Test-Path $configPath)) { throw "Tizen project not found: $Project" }
[xml]$config = Get-Content $configPath -Raw
$app = $config.GetElementsByTagName('application', 'http://tizen.org/ns/widgets')
if ($app.Count -ne 1 -or $app[0].GetAttribute('id') -ne 'VLRoomTest.RoomTest' -or $app[0].GetAttribute('package') -ne 'VLRoomTest') {
    throw 'The existing TV app identity does not match. No files were changed.'
}
$release = 'https://raw.githubusercontent.com/Leighk50/VL-WEB-PLATFORM/tv-local-explorer-release-1212/hotel-tv-client'
$base = 'https://raw.githubusercontent.com/Leighk50/VL-WEB-PLATFORM/2f4822f63ab651f5f3bc11a7f92b3891eb6086aa/hotel-tv-install'
$staging = Join-Path $env:TEMP ('Lindus-TV-1212-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    $archive = Join-Path $staging 'verified-base.zip'
    $output = [System.IO.File]::Create($archive)
    try {
        foreach ($part in 1..4) {
            $download = Join-Path $staging "part$part"
            Invoke-WebRequest "$base/VillageLimits-1.2.11.wgt.part$part" -OutFile $download -UseBasicParsing
            $inputFile = [System.IO.File]::OpenRead($download)
            try { $inputFile.CopyTo($output) } finally { $inputFile.Dispose() }
        }
    } finally { $output.Dispose() }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne 'A1289B8DE33AD426982066B5C623A842A9D5AF181A41BECE36E6AF877102C6A7') {
        throw 'The base media package failed verification. No project files were changed.'
    }
    $media = Join-Path $staging 'base'
    Expand-Archive -Path $archive -DestinationPath $media
    $files = @('index.html','settings.js','tv.js','tv.css')
    foreach ($file in $files) { Invoke-WebRequest "$release/$file" -OutFile (Join-Path $staging $file) -UseBasicParsing }
    $mediaFiles = @('lindus-combined-test.mp4','lindus-welcome-music.wav')
    $backup = Join-Path (Split-Path $Project -Parent) ('VL-TV-Backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($file in ($files + $mediaFiles + @('config.xml'))) {
        $target = Join-Path $Project $file
        if (Test-Path $target) { Copy-Item $target $backup }
    }
    foreach ($file in $files) { Copy-Item (Join-Path $staging $file) (Join-Path $Project $file) -Force }
    foreach ($file in $mediaFiles) { Copy-Item (Join-Path $media $file) (Join-Path $Project $file) -Force }
    foreach ($privilege in @('internet','application.launch','tv.window','tv.channel','tv.inputdevice','system','tv.audio')) {
        $name = 'http://tizen.org/privilege/' + $privilege
        $exists = @($config.GetElementsByTagName('privilege','http://tizen.org/ns/widgets') | Where-Object { $_.GetAttribute('name') -eq $name })
        if ($exists.Count -eq 0) { $element=$config.CreateElement('tizen','privilege','http://tizen.org/ns/widgets');$element.SetAttribute('name',$name);$config.DocumentElement.AppendChild($element) | Out-Null }
    }
    $config.DocumentElement.SetAttribute('version','1.2.12')
    $config.Save($configPath)
    Write-Host "Project updated to Lindus Hospitality TV 1.2.12. Backup: $backup"
    $cli = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
    if (Test-Path $cli) {
        foreach ($file in ($files + @('config.xml'))) { Copy-Item (Join-Path $Project $file) (Join-Path $media $file) -Force }
        foreach ($signature in @('author-signature.xml','signature1.xml')) { $old=Join-Path $media $signature; if (Test-Path $old) { Remove-Item $old } }
        & $cli package -t wgt -s $CertificateProfile -- $media
        if ($LASTEXITCODE -ne 0) { throw 'Signing did not finish. In Tizen Studio, refresh the project and use Build Signed Package with your existing certificate profile.' }
        $signed = Get-ChildItem $media -File -Filter '*.wgt' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (!$signed) { throw 'No signed widget was produced. Use Build Signed Package in Tizen Studio.' }
        $destination = Join-Path $Project 'VillageLimits-1.2.12.wgt'
        Copy-Item $signed.FullName $destination -Force
        Write-Host "Signed widget ready: $destination"
        Write-Host 'Upload that .wgt to this chat so it can be verified and published to all TVs.' 
    } else {
        Write-Host 'In Tizen Studio, refresh the project and choose Build Signed Package using your existing certificate profile. Upload the resulting .wgt to this chat.'
    }
} finally { Remove-Item $staging -Recurse -Force }
