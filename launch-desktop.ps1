$projectDir = Split-Path -Parent $PSCommandPath
$appUrl = "http://localhost:3000"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$serverLog = Join-Path $projectDir "desktop-dev-server.log"

function Test-AppReady {
  try {
    $null = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Path $edgePath)) {
  Write-Error "Microsoft Edge non trovato in $edgePath"
  exit 1
}

if (-not (Test-AppReady)) {
  $serverCommand = "Set-Location '$projectDir'; npm run dev *>> '$serverLog'"
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $serverCommand
  ) | Out-Null

  for ($i = 0; $i -lt 90; $i++) {
    if (Test-AppReady) { break }
    Start-Sleep -Seconds 1
  }
}

if (-not (Test-AppReady)) {
  Write-Error "Il server live dell'app non si e avviato su $appUrl. Controlla il log in $serverLog"
  exit 1
}

Start-Process -FilePath $edgePath -ArgumentList @("--app=$appUrl")
