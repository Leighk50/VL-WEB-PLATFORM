param([string]$Project = 'C:\Users\Leigh.TGM\workspace\VillageLimits')
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $Project 'config.xml'
if (!(Test-Path $configPath)) { throw "No Tizen project found at $Project. Pass -Project with your project folder." }
[xml]$config = Get-Content $configPath -Raw
$application = $config.GetElementsByTagName('application', 'http://tizen.org/ns/widgets')
if ($application.Count -ne 1) { throw 'The existing Tizen application ID could not be verified.' }
$source = 'https://raw.githubusercontent.com/Leighk50/VL-WEB-PLATFORM/main/hotel-tv-client'
$staging = Join-Path $env:TEMP ('VL-TV-download-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    $files = @('index.html','settings.js','tv.js','tv.css')
    foreach ($file in $files) {
        Invoke-WebRequest "$source/$file" -OutFile (Join-Path $staging $file)
    }
    $backup = Join-Path (Split-Path $Project -Parent) ('VL-TV-Backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($file in ($files + @('config.xml'))) {
        $target = Join-Path $Project $file
        if (Test-Path $target) { Copy-Item $target $backup }
    }
    foreach ($privilege in @('internet','application.launch','tv.window','tv.inputdevice','system')) {
        $name = 'http://tizen.org/privilege/' + $privilege
        $exists = @($config.GetElementsByTagName('privilege', 'http://tizen.org/ns/widgets') | Where-Object { $_.GetAttribute('name') -eq $name })
        if ($exists.Count -eq 0) {
            $element = $config.CreateElement('tizen', 'privilege', 'http://tizen.org/ns/widgets')
            $element.SetAttribute('name', $name)
            $config.DocumentElement.AppendChild($element) | Out-Null
        }
    }
    $config.DocumentElement.SetAttribute('version', '0.3.0')
    $config.Save($configPath)
    foreach ($file in $files) { Copy-Item (Join-Path $staging $file) (Join-Path $Project $file) -Force }
    Write-Host "Room 3 source upgraded to 0.3.0. Backup: $backup"
    Write-Host 'Existing application IDs and signing settings preserved. Refresh the project in Tizen Studio, then Run As > Tizen Web Application.'
} finally {
    Remove-Item $staging -Recurse -Force
}
