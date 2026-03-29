param(
  [ValidateSet("windows", "mac")]
  [string]$Platform = "",
  [string]$SourceDir = "",
  [string]$DestinationRoot = ""
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

function Normalize-PlatformValue([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ""
  }

  return $value.Trim().ToLowerInvariant()
}

function Test-IsWindowsArtifact([System.IO.FileInfo]$file, [string]$displayVersion, [string]$version) {
  $name = $file.Name
  $extension = $file.Extension.ToLowerInvariant()

  if ($name -in @("builder-debug.yml", "builder-effective-config.yaml")) {
    return $false
  }

  if ($name -like "Note-by-Jaco-*.zip") {
    return $false
  }

  if ($name -eq "latest.yml") {
    return $true
  }

  if ($extension -ne ".exe" -and $extension -ne ".blockmap" -and $extension -ne ".yml" -and $extension -ne ".yaml") {
    return $false
  }

  if (-not ($name.Contains($displayVersion) -or $name.Contains($version))) {
    return $false
  }

  if ($extension -eq ".blockmap" -and $name -notlike "*.exe.blockmap") {
    return $false
  }

  return $name -like "*Setup*" -or $name -like "*.exe" -or $name -like "*.exe.blockmap"
}

function Test-IsMacArtifact([System.IO.FileInfo]$file, [string]$displayVersion, [string]$version) {
  $name = $file.Name
  $extension = $file.Extension.ToLowerInvariant()

  if ($name -in @("builder-debug.yml", "builder-effective-config.yaml")) {
    return $false
  }

  if ($name -like "Note-by-Jaco-*.zip") {
    return $false
  }

  if ($name -like "latest-mac*.yml" -or $name -like "latest-mac*.yaml") {
    return $true
  }

  if ($extension -notin @(".dmg", ".pkg", ".zip", ".blockmap", ".yml", ".yaml")) {
    return $false
  }

  if (-not ($name.Contains($displayVersion) -or $name.Contains($version))) {
    return $false
  }

  if ($extension -eq ".zip" -or $extension -eq ".blockmap") {
    return $name -like "*-mac*" -or $name -like "*.dmg.blockmap" -or $name -like "*.pkg.blockmap"
  }

  return $extension -eq ".dmg" -or $extension -eq ".pkg"
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
$normalizedPlatform = Normalize-PlatformValue $Platform
$resolvedSourceDir = Resolve-RootedPath $root $SourceDir
if ([string]::IsNullOrWhiteSpace($resolvedSourceDir)) {
  $resolvedSourceDir = Join-Path $root "dist-desktop"
}

$resolvedDestinationRoot = Resolve-RootedPath $root $DestinationRoot
if ([string]::IsNullOrWhiteSpace($resolvedDestinationRoot)) {
  $resolvedDestinationRoot = Join-Path $root "installer"
}

if (-not (Test-Path $resolvedSourceDir)) {
  throw "Cartella sorgente non trovata: $resolvedSourceDir"
}
$allSourceFiles = Get-ChildItem $resolvedSourceDir -File

if ([string]::IsNullOrWhiteSpace($normalizedPlatform)) {
  $hasWindowsArtifacts = $allSourceFiles | Where-Object { Test-IsWindowsArtifact $_ $displayVersion $version } | Select-Object -First 1
  $hasMacArtifacts = $allSourceFiles | Where-Object { Test-IsMacArtifact $_ $displayVersion $version } | Select-Object -First 1

  if ($hasWindowsArtifacts -and -not $hasMacArtifacts) {
    $normalizedPlatform = "windows"
  } elseif ($hasMacArtifacts -and -not $hasWindowsArtifacts) {
    $normalizedPlatform = "mac"
  } elseif ($hasWindowsArtifacts -and $hasMacArtifacts) {
    throw "Trovati artefatti sia Windows sia Mac. Passa esplicitamente -Platform windows oppure -Platform mac."
  } else {
    throw "Nessun artefatto installer trovato in $resolvedSourceDir per la versione $displayVersion"
  }
}

$artifactFiles = if ($normalizedPlatform -eq "windows") {
  $allSourceFiles | Where-Object { Test-IsWindowsArtifact $_ $displayVersion $version }
} else {
  $allSourceFiles | Where-Object { Test-IsMacArtifact $_ $displayVersion $version }
}

if ($artifactFiles.Count -eq 0) {
  throw "Nessun artefatto $normalizedPlatform trovato in $resolvedSourceDir per la versione $displayVersion"
}

if (-not (Test-Path $resolvedDestinationRoot)) {
  New-Item -ItemType Directory -Path $resolvedDestinationRoot | Out-Null
}

Get-ChildItem $resolvedDestinationRoot -Force | Where-Object { $_.Name -ne $displayVersion } | Remove-Item -Recurse -Force

$versionDir = Join-Path $resolvedDestinationRoot $displayVersion
if (-not (Test-Path $versionDir)) {
  New-Item -ItemType Directory -Path $versionDir | Out-Null
}

Get-ChildItem $versionDir -Force | Where-Object { $_.Name -notin @("windows", "mac") } | Remove-Item -Recurse -Force

foreach ($platformName in @("windows", "mac")) {
  $platformDir = Join-Path $versionDir $platformName
  if (-not (Test-Path $platformDir)) {
    New-Item -ItemType Directory -Path $platformDir | Out-Null
  }
}

$targetPlatformDir = Join-Path $versionDir $normalizedPlatform
Get-ChildItem $targetPlatformDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

foreach ($artifact in $artifactFiles) {
  Copy-Item $artifact.FullName (Join-Path $targetPlatformDir $artifact.Name) -Force
}

Write-Host "Artefatti installer sincronizzati in: $targetPlatformDir"
Write-Host ("Piattaforma: " + $normalizedPlatform)
Write-Host ("File copiati: " + (($artifactFiles | Sort-Object Name | ForEach-Object { $_.Name }) -join ", "))
