param(
  [string]$ReadmePath = "",
  [string]$OutputDir = "",
  [string]$AdditionalFilesDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RootedPath([string]$root, [string]$candidate) {
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    return $null
  }

  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate
  }

  return Join-Path $root $candidate
}

$root = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $root "package.json"

if (-not (Test-Path $packageJsonPath)) {
  throw "package.json non trovato: $packageJsonPath"
}

$package = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$package.version

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Versione non trovata in package.json"
}

$displayVersion = $version -replace '-beta(\.\d+)?$', 'b'
$releaseName = "Note-by-Jaco-$displayVersion"
$resolvedOutputDir = Resolve-RootedPath $root $OutputDir
if ([string]::IsNullOrWhiteSpace($resolvedOutputDir)) {
  $resolvedOutputDir = Join-Path $root "dist-desktop"
}

$resolvedAdditionalFilesDir = Resolve-RootedPath $root $AdditionalFilesDir
if ([string]::IsNullOrWhiteSpace($resolvedAdditionalFilesDir)) {
  $resolvedAdditionalFilesDir = Join-Path $root "release\include"
}

if (-not (Test-Path $resolvedOutputDir)) {
  throw "Cartella output non trovata: $resolvedOutputDir"
}

$readmeCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($ReadmePath)) {
  $readmeCandidates += Resolve-RootedPath $root $ReadmePath
} else {
  $readmeCandidates += @(
    (Join-Path $root "release\\README.txt"),
    (Join-Path $root "release\\README.md"),
    (Join-Path $root "README-release.txt"),
    (Join-Path $root "README-release.md")
  )
}

$resolvedReadmePath = $readmeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $resolvedReadmePath) {
  throw "README utente non trovato. Passa -ReadmePath oppure crea release\\README.txt"
}

$additionalFiles = @()
if ($resolvedAdditionalFilesDir -and (Test-Path $resolvedAdditionalFilesDir)) {
  $additionalFiles = Get-ChildItem $resolvedAdditionalFilesDir -File | Sort-Object Name
}

$installer = Get-ChildItem $resolvedOutputDir -File -Filter *.exe |
  Where-Object { $_.Name -notmatch 'portable' -and $_.Name -notmatch '^unins' } |
  Sort-Object @{ Expression = { if ($_.Name -match 'Setup') { 0 } else { 1 } } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true } |
  Select-Object -First 1

if (-not $installer) {
  throw "Installer .exe non trovato in $resolvedOutputDir"
}

$stagingDir = Join-Path $resolvedOutputDir "$releaseName-staging"
$zipPath = Join-Path $resolvedOutputDir "$releaseName.zip"
$readmeExtension = [System.IO.Path]::GetExtension($resolvedReadmePath)
$readmeFileName = if ([string]::IsNullOrWhiteSpace($readmeExtension)) { "README" } else { "README$readmeExtension" }

if (Test-Path $stagingDir) {
  Remove-Item -Recurse -Force $stagingDir
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Path $stagingDir | Out-Null
Copy-Item $installer.FullName (Join-Path $stagingDir "Installer$($installer.Extension)")
Copy-Item $resolvedReadmePath (Join-Path $stagingDir $readmeFileName)

foreach ($file in $additionalFiles) {
  $destinationName = $file.Name
  if ($destinationName -ieq $readmeFileName) {
    continue
  }
  if ($destinationName -ieq "Installer$($installer.Extension)") {
    continue
  }

  Copy-Item $file.FullName (Join-Path $stagingDir $destinationName)
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -Recurse -Force $stagingDir

Write-Host "Release creata: $zipPath"
if ($additionalFiles.Count -gt 0) {
  Write-Host ("File extra inclusi: " + (($additionalFiles | ForEach-Object { $_.Name }) -join ", "))
}
