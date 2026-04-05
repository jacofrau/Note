$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$desktopDir = [Environment]::GetFolderPath("Desktop")
$iconPath = Join-Path $projectDir "public\icons\notedijaco_icon.ico"
$devShortcutPath = Join-Path $projectDir "Avvia Server Dev.lnk"
$liveShortcutPath = Join-Path $projectDir "Notes Live Ver..lnk"
$desktopShortcutPath = Join-Path $desktopDir "Note.lnk"
$legacyDesktopShortcutPath = Join-Path $desktopDir "Note TEST.lnk"
$launchScriptPath = Join-Path $projectDir "launch-desktop.ps1"
$launchVbsPath = Join-Path $projectDir "launch-desktop.vbs"
$appUrl = "http://localhost:3000/?mode=live"
$desktopAppUrl = "http://localhost:3000"

function Get-EdgePath {
  $candidates = @(@(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
  ) | Where-Object { $_ -and (Test-Path $_) })

  if ($candidates.Count -gt 0) {
    return $candidates[0]
  }

  return "msedge.exe"
}

function New-Shortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,
    [string]$Arguments = "",
    [string]$WorkingDirectory = "",
    [string]$IconLocation = ""
  )

  $shell = New-Object -ComObject WScript.Shell

  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Force
  }

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments

  if ($WorkingDirectory) {
    $shortcut.WorkingDirectory = $WorkingDirectory
  }

  if ($IconLocation) {
    $shortcut.IconLocation = $IconLocation
  }

  $shortcut.Save()
}

if (-not (Test-Path $launchScriptPath)) {
  throw "File non trovato: $launchScriptPath"
}

if (-not (Test-Path $launchVbsPath)) {
  throw "File non trovato: $launchVbsPath"
}

if (-not (Test-Path $iconPath)) {
  throw "Icona non trovata: $iconPath"
}

$powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$edgePath = Get-EdgePath

New-Shortcut `
  -Path $devShortcutPath `
  -TargetPath $powershellPath `
  -Arguments "-NoExit -ExecutionPolicy Bypass -Command ""Set-Location -LiteralPath '$projectDir'; npm run dev""" `
  -WorkingDirectory $projectDir `
  -IconLocation $iconPath

New-Shortcut `
  -Path $liveShortcutPath `
  -TargetPath $edgePath `
  -Arguments "--app=$appUrl" `
  -WorkingDirectory $projectDir `
  -IconLocation $iconPath

New-Shortcut `
  -Path $desktopShortcutPath `
  -TargetPath $edgePath `
  -Arguments "--app=$desktopAppUrl" `
  -WorkingDirectory $projectDir `
  -IconLocation $iconPath

if (Test-Path $legacyDesktopShortcutPath) {
  New-Shortcut `
    -Path $legacyDesktopShortcutPath `
    -TargetPath $edgePath `
    -Arguments "--app=$desktopAppUrl" `
    -WorkingDirectory $projectDir `
    -IconLocation $iconPath
}
