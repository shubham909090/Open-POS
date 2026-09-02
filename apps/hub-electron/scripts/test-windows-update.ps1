param([string]$PreviousVersion = "0.1.19")

$ErrorActionPreference = "Stop"
$hubRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $hubRoot "package.json") | ConvertFrom-Json).version
$root = Join-Path $env:RUNNER_TEMP "gpos-update-smoke"
New-Item -ItemType Directory -Force $root | Out-Null
Start-Transcript -Path (Join-Path $root "smoke.log")

function Wait-ForHub {
  for ($i = 0; $i -lt 60; $i++) {
    try {
      if ((Invoke-RestMethod "http://127.0.0.1:43737/health").ok) { return }
    } catch {}
    Start-Sleep -Seconds 1
  }
  throw "Hub did not become healthy"
}

function Find-InstalledHub {
  $entry = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
    Where-Object { $_.DisplayName -like "Gaurav POS Hub*" } | Select-Object -First 1
  if (!$entry) { throw "Hub uninstall registration is missing" }
  $uninstaller = if ($entry.UninstallString -match '^"([^"]+)"') { $Matches[1] } else { $entry.UninstallString }
  return Join-Path (Split-Path $uninstaller -Parent) "Gaurav POS Hub.exe"
}

function Get-HubVersion([string]$AppPath) {
  Write-Host "Installed executable: $AppPath; PE version: $((Get-Item $AppPath).VersionInfo.ProductVersion)"
  $archive = Join-Path (Split-Path $AppPath -Parent) "resources/app.asar"
  $packageVersion = node --input-type=commonjs -e "const asar = require(require.resolve('@electron/asar', { paths: ['./node_modules/.pnpm/node_modules'] })); console.log(JSON.parse(asar.extractFile(process.argv[1], 'package.json').toString('utf8')).version);" $archive
  if ($LASTEXITCODE -ne 0) { throw "Could not read installed Hub package version" }
  Write-Host "Installed package version: $packageVersion"
  return $packageVersion.Trim()
}

try {
  gh release download "hub-v$PreviousVersion" --repo shubham909090/Open-POS --pattern "Gaurav-POS-Hub-Setup-$PreviousVersion.exe" --dir $root
  if ($LASTEXITCODE -ne 0) { throw "Previous installer download failed" }
  $previousInstaller = Join-Path $root "Gaurav-POS-Hub-Setup-$PreviousVersion.exe"
  $install = Start-Process $previousInstaller -ArgumentList "/S" -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "Previous install failed: $($install.ExitCode)" }
  $appPath = Find-InstalledHub
  if ((Get-HubVersion $appPath) -ne $PreviousVersion) { throw "Previous version was not installed" }

  $env:HUB_HOST = "127.0.0.1"
  $env:HUB_PORT = "43737"
  $env:HUB_ADMIN_TOKEN = "windows-smoke-only-token"
  $env:HUB_DATABASE_PATH = Join-Path $root "data/hub.sqlite"
  $env:HUB_BACKUP_DIR = Join-Path $root "backups"
  $env:HUB_UPDATE_DIR = Join-Path $root "updates"
  $env:HUB_CONFIG_FILE = Join-Path $root "empty.env"
  New-Item -ItemType File -Force $env:HUB_CONFIG_FILE | Out-Null
  # NSIS may relaunch through Explorer, which does not inherit this shell's environment.
  $configRoot = Join-Path $env:APPDATA "Gaurav POS Hub"
  New-Item -ItemType Directory -Force $configRoot | Out-Null
  @("HUB_HOST=$env:HUB_HOST", "HUB_PORT=$env:HUB_PORT", "HUB_ADMIN_TOKEN=$env:HUB_ADMIN_TOKEN", "HUB_DATABASE_PATH=$env:HUB_DATABASE_PATH", "HUB_BACKUP_DIR=$env:HUB_BACKUP_DIR", "HUB_UPDATE_DIR=$env:HUB_UPDATE_DIR") |
    Set-Content (Join-Path $configRoot "hub.env")
  $oldApp = Start-Process $appPath -PassThru
  Wait-ForHub

  # A real saved setting must survive replacing the installed application.
  $headers = @{ "x-device-token" = $env:HUB_ADMIN_TOKEN }
  Invoke-RestMethod "http://127.0.0.1:43737/settings/manager-pin" -Method Put -Headers $headers -ContentType "application/json" -Body '{"newPin":"4321","updatedBy":"windows-smoke"}' | Out-Null
  if (!(Test-Path $env:HUB_DATABASE_PATH)) { throw "Hub database was not created" }

  $env:SMOKE_PARENT_PID = [string]$oldApp.Id
  $env:SMOKE_APP_PATH = $appPath
  $env:SMOKE_ROOT = $root
  $env:SMOKE_INSTALLER = Join-Path $hubRoot "release/Gaurav POS Hub Setup $version.exe"
  Push-Location $hubRoot
  try {
    $planJson = node --input-type=module -e @'
import { join } from 'node:path';
import { writeWindowsInstallerHandoff } from './dist/update/windows-update-handoff.js';
const plan = writeWindowsInstallerHandoff({
  scriptPath: join(process.env.SMOKE_ROOT, "Handoff O'Hara & \u00e9", 'Install Gaurav POS Update.ps1'),
  logPath: join(process.env.SMOKE_ROOT, 'install-handoff.log'),
  parentPid: Number(process.env.SMOKE_PARENT_PID),
  appExecutablePath: process.env.SMOKE_APP_PATH,
  installer: { filePath: process.env.SMOKE_INSTALLER, args: ['--updated', '/S', '--force-run'] }
});
console.log(JSON.stringify(plan));
'@
    if ($LASTEXITCODE -ne 0) { throw "Handoff generation failed" }
  } finally { Pop-Location }
  $plan = $planJson | ConvertFrom-Json
  $quotedArgs = $plan.args | ForEach-Object { '"' + $_ + '"' }
  $handoff = Start-Process $plan.filePath -ArgumentList $quotedArgs -PassThru
  Start-Sleep -Seconds 3
  if ((Get-HubVersion $appPath) -ne $PreviousVersion) { throw "Installer ran before the old app exited" }
  if (!$oldApp.CloseMainWindow()) { throw "Could not request a graceful Hub shutdown" }
  if (!$oldApp.WaitForExit(120000)) { throw "Old Hub did not exit cleanly" }
  if (!$handoff.WaitForExit(180000)) { throw "Update handoff timed out" }
  if ($handoff.ExitCode -ne 0) { throw "Update handoff failed: $($handoff.ExitCode)" }
  if ((Get-HubVersion $appPath) -ne $version) { throw "Candidate version was not installed" }
  Wait-ForHub

  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $headers -ContentType "application/json" -Body '{"pin":"4321"}' | Out-Null
  Get-Process -Name "Gaurav POS Hub" -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(30000) | Out-Null }
  $selfTest = Start-Process $appPath -ArgumentList "--self-test-sqlite" -PassThru -Wait
  if ($selfTest.ExitCode -ne 0) { throw "Installed SQLite self-test failed" }
  @{ previousVersion = $PreviousVersion; installedVersion = $version; databasePreserved = $true; sqliteSelfTest = "passed" } |
    ConvertTo-Json | Set-Content (Join-Path $root "result.json")
} catch {
  $failure = $_
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match "Gaurav|setup|powershell" } |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine |
    ConvertTo-Json | Set-Content (Join-Path $root "processes.json")
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save((Join-Path $root "failure.png"))
    $graphics.Dispose()
    $bitmap.Dispose()
  } catch { Write-Warning "Could not capture desktop: $_" }
  throw $failure
} finally {
  if (Test-Path (Join-Path $root "install-handoff.log")) { Get-Content (Join-Path $root "install-handoff.log") }
  Stop-Transcript
}
