$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $root 'release'
$electronDist = Join-Path $root 'packages\electron\node_modules\electron\dist'
$electronPackage = Get-Content -LiteralPath (Join-Path $root 'packages\electron\package.json') -Raw | ConvertFrom-Json
$version = $electronPackage.version
$appName = 'Temu Lister'
$outDir = Join-Path $releaseDir "$appName-$version-win-x64-portable"
$appDir = Join-Path $outDir 'resources\app'
$webDir = Join-Path $outDir 'resources\web\dist'
$extensionDir = Join-Path $outDir 'chrome-extension'
$extensionZip = Join-Path $outDir 'temu-chrome-extension.zip'
$zipPath = Join-Path $releaseDir "$appName-$version-win-x64-portable.zip"

if (-not (Test-Path $electronDist)) {
  throw "Electron runtime not found: $electronDist"
}

$releasePath = [System.IO.Path]::GetFullPath($releaseDir)
$outPath = [System.IO.Path]::GetFullPath($outDir)
if (-not $outPath.StartsWith($releasePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to package outside release directory: $outPath"
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path $outDir) {
  Remove-Item -LiteralPath $outDir -Recurse -Force
}
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Copy-Item -LiteralPath $electronDist -Destination $outDir -Recurse -Force
$electronExe = Join-Path $outDir 'electron.exe'
$appExe = Join-Path $outDir "$appName.exe"
if (Test-Path $appExe) {
  Remove-Item -LiteralPath $appExe -Force
}
Rename-Item -LiteralPath $electronExe -NewName "$appName.exe"

Push-Location $root
try {
  pnpm --filter @temu-lister/electron deploy --legacy --prod $appDir
} finally {
  Pop-Location
}

foreach ($relative in @('.env', '.omc', 'release', 'src', 'test-collect.js', 'tsconfig.json')) {
  $target = Join-Path $appDir $relative
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

Copy-Item -LiteralPath (Join-Path $root 'packages\electron\dist') -Destination (Join-Path $appDir 'dist') -Recurse -Force
New-Item -ItemType Directory -Force -Path $webDir | Out-Null
Copy-Item -Path (Join-Path $root 'packages\web\dist\*') -Destination $webDir -Recurse -Force

New-Item -ItemType Directory -Force -Path $extensionDir | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'packages\extension\manifest.json') -Destination $extensionDir -Force
Copy-Item -LiteralPath (Join-Path $root 'packages\extension\src') -Destination (Join-Path $extensionDir 'src') -Recurse -Force
if (Test-Path $extensionZip) {
  Remove-Item -LiteralPath $extensionZip -Force
}
Compress-Archive -Path (Join-Path $extensionDir '*') -DestinationPath $extensionZip -Force

$readme = @"
Temu Lister portable package

Run:
  1. Double-click "Temu Lister.exe".
  2. Open http://localhost:23790 if the browser does not open automatically.

Product collection extension:
  1. Open Chrome and go to chrome://extensions.
  2. Enable Developer mode.
  3. Click Load unpacked.
  4. Select the chrome-extension folder in this package.
  5. Keep Temu Lister running, then open a Temu product page and click the collect button.

Requirements:
  - Windows 10/11 x64
  - Google Chrome
  - Photoshop with Remote Connections enabled for mockup generation

Notes:
  - User data is stored on each computer under Electron's userData directory.
  - Do not run two copies at the same time; the app uses local ports 23790 and 23789.
"@
Set-Content -LiteralPath (Join-Path $outDir 'README.txt') -Value $readme -Encoding UTF8

Compress-Archive -LiteralPath $outDir -DestinationPath $zipPath -Force

$files = Get-ChildItem -LiteralPath $outDir -Recurse -File
$sizeMb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 2)
Write-Host "Portable directory: $outDir"
Write-Host "Portable zip:       $zipPath"
Write-Host "Files:              $($files.Count)"
Write-Host "Size:               $sizeMb MB"
