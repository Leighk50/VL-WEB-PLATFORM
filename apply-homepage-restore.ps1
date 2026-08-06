$ErrorActionPreference = "Stop"

$serverPath = Join-Path (Get-Location) "server.js"
$contentPath = Join-Path (Get-Location) "data\content.json"

if (-not (Test-Path $serverPath)) {
    throw "server.js was not found. Run this script from the root of VL-WEB-PLATFORM."
}

$server = Get-Content $serverPath -Raw

$newRenderHome = @'
function renderHome(){ return shell('Home', `<section class="home-hero"><div class="shade"></div><div class="container hero-copy"><img src="/assets/images/logo-white.png" alt="Village Limits"><div class="eyebrow">Woodhall Spa, Lincolnshire</div><h1>Dine. Stay. Make an evening of it.</h1><p>Thoughtful food, welcoming rooms and entertainment worth leaving home for.</p><div class="actions"><a class="btn" href="/book-table">Book a Table</a><a class="btn outline-light" href="/stay">Book Accommodation</a><a class="btn outline-light" href="/whats-on">What's On</a></div></div></section><section class="section"><div class="container split"><div><img src="/assets/images/rooms.webp" alt="Village Limits accommodation"></div><div><div class="eyebrow">Stay at Village Limits</div><h2>Relax, stay over and enjoy more of Woodhall Spa</h2><p class="lead">Comfortable, air-conditioned accommodation with direct online booking.</p><p>Free parking, Wi-Fi, breakfast availability and the restaurant and entertainment all on site.</p><div class="actions"><a class="btn large" href="/stay">View Accommodation</a><a class="btn dark" target="_blank" rel="noopener" href="https://direct-book.com/properties/VillageLimitsMotelDirect?locale=en&items[0][adults]=2&items[0][children]=0&items[0][infants]=0&currency=GBP&trackPage=yes">Check Availability</a></div></div></div></section><section class="section"><div class="container split"><div><div class="eyebrow">Welcome</div><h2>Good food, comfortable rooms and memorable evenings</h2><p class="lead">Discover Village Limits in Woodhall Spa.</p><div class="actions"><a class="btn" href="/eat">View Menus</a><a class="btn outline" href="/whats-on">What's On</a></div></div><img src="/assets/images/interior.webp" alt="Village Limits interior"></div></section>`); }
'@

$pattern = 'function renderHome\(\)\{.*?\}\r?\nfunction renderEat\(\)'
if ($server -notmatch $pattern) {
    throw "Could not find the existing renderHome function in server.js."
}

$replacement = $newRenderHome + "`r`nfunction renderEat()"
$server = [regex]::Replace($server, $pattern, $replacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)
Set-Content -Path $serverPath -Value $server -Encoding UTF8

if (Test-Path $contentPath) {
    $json = Get-Content $contentPath -Raw | ConvertFrom-Json
    $json.version = "1.1.1"
    $json.buildLabel = "Homepage Restored and Accommodation Featured"
    $json | ConvertTo-Json -Depth 20 | Set-Content $contentPath -Encoding UTF8
}

Write-Host "Homepage restoration applied successfully." -ForegroundColor Green
Write-Host 'Now run:'
Write-Host 'git add server.js data/content.json'
Write-Host 'git commit -m "Restore homepage design and accommodation focus"'
Write-Host 'git pull --rebase'
Write-Host 'git push'
