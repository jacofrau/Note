$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "build"
$iconPath = Join-Path $root "public\icons\notedijaco_icon.png"
$packageJsonPath = Join-Path $root "package.json"

if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

$version = "1.0.0"
try {
  $package = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
  if ($package.version) {
    $version = [string]$package.version
  }
} catch {
}

$displayVersion = $version -replace '-beta(\.\d+)?$', 'b'

$bgDark = [System.Drawing.Color]::FromArgb(11, 11, 16)
$bgMid = [System.Drawing.Color]::FromArgb(24, 20, 44)
$bgSoft = [System.Drawing.Color]::FromArgb(40, 31, 74)
$accent = [System.Drawing.Color]::FromArgb(124, 92, 255)
$accentSoft = [System.Drawing.Color]::FromArgb(178, 158, 255)
$textMain = [System.Drawing.Color]::FromArgb(238, 240, 255)
$textMuted = [System.Drawing.Color]::FromArgb(185, 188, 214)

$icon = $null
if (Test-Path $iconPath) {
  $icon = [System.Drawing.Image]::FromFile($iconPath)
}

function New-Brush([string]$hex) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Save-Bitmap([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Dispose()
}

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $diameter = $radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-BrandSidebar([string]$path, [bool]$isUninstaller) {
  $width = 164
  $height = 314
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $rect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $bgDark, $bgMid, 90
  $graphics.FillRectangle($gradient, $rect)

  $glow1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, $accent))
  $glow2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, $bgSoft))
  $graphics.FillEllipse($glow1, -24, 18, 150, 150)
  $graphics.FillEllipse($glow2, 38, 146, 128, 128)

  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(68, $accentSoft), 1.5)
  $graphics.DrawLine($linePen, 18, 146, 146, 146)

  if ($icon) {
    $graphics.DrawImage($icon, 18, 24, 46, 46)
  }

  $titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", 16, [System.Drawing.FontStyle]::Bold)
  $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 8.8, [System.Drawing.FontStyle]::Regular)
  $smallFont = New-Object System.Drawing.Font("Segoe UI Semibold", 7.8, [System.Drawing.FontStyle]::Regular)

  $mainBrush = New-Object System.Drawing.SolidBrush $textMain
  $mutedBrush = New-Object System.Drawing.SolidBrush $textMuted
  $pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, $accent))
  $pillBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(96, $accentSoft), 1)

  $graphics.DrawString("Note by Jaco", $titleFont, $mainBrush, 18, 88)
  $subtitle = if ($isUninstaller) { "Rimozione guidata" } else { "Le tue note, sempre con te." }
  $graphics.DrawString($subtitle, $subtitleFont, $mutedBrush, 18, 118)

  $pillPath = New-RoundedPath 18 160 78 24 12
  $graphics.FillPath($pillBrush, $pillPath)
  $graphics.DrawPath($pillBorder, $pillPath)
  $graphics.DrawString("Ver. $displayVersion", $smallFont, $mainBrush, 31, 166)

  $footerText = if ($isUninstaller) { "A presto." } else { "@jacofrau" }
  $graphics.DrawString($footerText, $subtitleFont, $mutedBrush, 18, 278)

  $gradient.Dispose()
  $glow1.Dispose()
  $glow2.Dispose()
  $linePen.Dispose()
  $titleFont.Dispose()
  $subtitleFont.Dispose()
  $smallFont.Dispose()
  $mainBrush.Dispose()
  $mutedBrush.Dispose()
  $pillBrush.Dispose()
  $pillBorder.Dispose()
  $pillPath.Dispose()
  $graphics.Dispose()
  Save-Bitmap $bitmap $path
}

function Draw-BrandHeader([string]$path) {
  $width = 150
  $height = 57
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $rect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $bgDark, $bgMid, 0
  $graphics.FillRectangle($gradient, $rect)

  $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(52, $accent))
  $graphics.FillEllipse($accentBrush, 98, -26, 78, 78)

  if ($icon) {
    $graphics.DrawImage($icon, 10, 8, 28, 28)
  }

  $titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", 12, [System.Drawing.FontStyle]::Bold)
  $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 6.7, [System.Drawing.FontStyle]::Regular)
  $mainBrush = New-Object System.Drawing.SolidBrush $textMain
  $mutedBrush = New-Object System.Drawing.SolidBrush $textMuted

  $graphics.DrawString("Note by Jaco", $titleFont, $mainBrush, 44, 10)
  $graphics.DrawString("Installer desktop", $subtitleFont, $mutedBrush, 45, 30)

  $gradient.Dispose()
  $accentBrush.Dispose()
  $titleFont.Dispose()
  $subtitleFont.Dispose()
  $mainBrush.Dispose()
  $mutedBrush.Dispose()
  $graphics.Dispose()
  Save-Bitmap $bitmap $path
}

Draw-BrandHeader (Join-Path $buildDir "installerHeader.bmp")
Draw-BrandSidebar (Join-Path $buildDir "installerSidebar.bmp") $false
Draw-BrandSidebar (Join-Path $buildDir "uninstallerSidebar.bmp") $true

if ($icon) {
  $icon.Dispose()
}
