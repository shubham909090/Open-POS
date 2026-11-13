param(
  [string]$PreviousVersion = "0.1.19",
  [string]$FixtureVersion = "",
  [string]$OnlineTargetVersion = "",
  [string]$PublishedSourceVersion = ""
)

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

function Get-UninstallerIntegrity([string]$AppPath) {
  $env:SMOKE_UNINSTALLER = Join-Path (Split-Path $AppPath -Parent) 'Uninstall Gaurav POS Hub.exe'
  $result = node --input-type=module -e @'
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
const b = readFileSync(process.env.SMOKE_UNINSTALLER);
for (let i = 512; i < b.length - 28; i += 512) {
  if (b.readUInt32LE(i + 4) !== 0xdeadbeef || b.subarray(i + 8, i + 20).toString() !== 'NullsoftInst') continue;
  const end = i + b.readUInt32LE(i + 24) - 4;
  const stored = b.readUInt32LE(end);
  const actual = crc32(b.subarray(512, end));
  console.log(JSON.stringify({ valid: stored === actual, stored, actual, sha256: createHash('sha256').update(b).digest('hex') }));
  break;
}
'@
  if ($LASTEXITCODE -ne 0 -or !$result) { throw "Could not inspect uninstaller integrity" }
  Write-Host "Uninstaller integrity: $result"
  return $result | ConvertFrom-Json
}

function Stop-HubGracefully {
  $processes = @(Get-Process -Name "Gaurav POS Hub" -ErrorAction SilentlyContinue)
  $processes | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  foreach ($process in $processes) {
    if (!$process.WaitForExit(120000)) { throw "Hub process did not exit: $($process.Id)" }
  }
}

function Test-PackagedHubUpdate {
  # This is the installed application's authenticated production route. It uses
  # AppUpdateService's default launcher, with no injected/external handoff helper.
  # A same-version package exercises install/reopen before a public feed exists;
  # it does not claim to prove online release discovery or differential download.
  $packagePath = Join-Path $hubRoot "release/Gaurav POS Hub-$version.gpos-update.zip"
  if (!(Test-Path $packagePath)) { throw "Candidate update package is missing: $packagePath" }
  $installHeaders = @{ "x-device-token" = $env:HUB_ADMIN_TOKEN; "x-manager-pin" = "4321" }
  $body = @{ packagePath = $packagePath } | ConvertTo-Json
  Invoke-RestMethod "http://127.0.0.1:43737/system/update/register-baseline" -Method Post -Headers $installHeaders -ContentType "application/json" -Body $body | Out-Null
  $status = Invoke-RestMethod "http://127.0.0.1:43737/system/update/status" -Headers $installHeaders
  if (!$status.baselineRegistered -or $status.appVersion -ne $version) { throw "Packaged Hub baseline did not register for $version" }
  if ($status.activeOrderCount -ne 0) { throw "Smoke update unexpectedly has running orders" }
  $app = Get-Process -Name "Gaurav POS Hub" | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (!$app) { throw "Installed Hub window process is missing before packaged update" }
  $oldPid = $app.Id
  $attemptsBefore = @(Get-ChildItem $env:HUB_UPDATE_DIR -Directory -Filter "handoff-*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $backupsBefore = @(Get-ChildItem $env:HUB_BACKUP_DIR -File -Filter "*.sqlite" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $logPath = Join-Path $env:HUB_UPDATE_DIR "install-handoff.log"
  $logBefore = if (Test-Path $logPath) { [string](Get-Content $logPath -Raw) } else { "" }
  $requestError = $null
  try {
    $response = Invoke-RestMethod "http://127.0.0.1:43737/system/update/install" -Method Post -Headers $installHeaders -ContentType "application/json" -Body $body -TimeoutSec 60
    if (!$response.installing) { throw "Packaged update API did not report installing" }
  } catch {
    # Shutdown can close the HTTP connection after the helper is authorized.
    # Never accept an HTTP rejection, and require every on-disk/process/result
    # assertion below before accepting a transport disconnect as successful.
    if ($_.Exception.Response -or $_.Exception.Message -eq "Packaged update API did not report installing") { throw }
    $requestError = $_.Exception.Message
    Write-Warning "Packaged update request ended during shutdown: $requestError"
  }

  $attempts = @(Get-ChildItem $env:HUB_UPDATE_DIR -Directory -Filter "handoff-*" | Where-Object { $_.FullName -notin $attemptsBefore })
  if ($attempts.Count -ne 1) { throw "Expected one new packaged helper attempt, found $($attempts.Count)" }
  $attempt = $attempts[0].FullName
  if (!(Test-Path (Join-Path $attempt "ready"))) { throw "Packaged helper never acknowledged readiness" }
  if ((Get-Content (Join-Path $attempt "decision") -Raw) -ne "go") { throw "Packaged helper was not authorized" }
  if (!(Get-Content (Join-Path $attempt "startup.log") -Raw).Contains("helper ready; shutdown authorized")) { throw "Packaged launcher readiness was not logged" }
  if (!$app.WaitForExit(120000)) { throw "Packaged update did not close installed Hub PID $oldPid" }

  $statePath = Join-Path $env:HUB_UPDATE_DIR "app-update-state.json"
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
  $backupPath = $state.previous.preUpdateBackupPath
  if (!$backupPath -or $backupPath -in $backupsBefore -or !(Test-Path $backupPath) -or (Get-Item $backupPath).Length -le 0) {
    throw "Packaged update did not create a new pre-update database backup"
  }
  $deadline = (Get-Date).AddSeconds(180)
  $newLog = ""
  do {
    if (Test-Path $logPath) {
      $allLog = [string](Get-Content $logPath -Raw)
      if ($allLog.StartsWith($logBefore)) { $newLog = $allLog.Substring($logBefore.Length) }
    }
    if ($newLog.Contains("Update installer completed successfully.")) { break }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  if (!$newLog.Contains("Update installer completed successfully.")) { throw "Packaged update installer did not complete; see $logPath" }
  $newLog | Set-Content (Join-Path $root "packaged-update-handoff.log")
  Wait-ForHub
  $reopened = Get-Process -Name "Gaurav POS Hub" | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (!$reopened -or $reopened.Id -eq $oldPid) { throw "Packaged update did not reopen a new Hub process" }
  if ((Get-HubVersion $appPath) -ne $version) { throw "Packaged update installed the wrong version" }
  if (!(Get-UninstallerIntegrity $appPath).valid) { throw "Packaged update corrupted the next update's uninstaller" }
  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $installHeaders -ContentType "application/json" -Body '{"pin":"4321"}' | Out-Null
  $reopenedStatus = Invoke-RestMethod "http://127.0.0.1:43737/system/update/status" -Headers $installHeaders
  if ($reopenedStatus.appVersion -ne $version -or !$reopenedStatus.baselineRegistered -or $reopenedStatus.pending) { throw "Reopened Hub did not finalize the packaged update" }
  $result = @{
    route = "/system/update/install"; launcher = "installed AppUpdateService default"; sameVersionReinstall = $true
    helperReady = $true; helperAuthorized = $true; preUpdateBackup = Split-Path $backupPath -Leaf
    previousPid = $oldPid; reopenedPid = $reopened.Id; managerPinPreserved = $true
    onlineFeedTested = $false; requestDisconnect = $requestError
  }
  $result | ConvertTo-Json | Set-Content (Join-Path $root "packaged-update-result.json")
  return $result
}

function Test-FailedInstallerRecovery {
  # Exercise the real helper's failure path against the installed application.
  # Only the installer is replaced with cmd's deterministic non-zero exit.
  Push-Location $hubRoot
  try {
    node --input-type=module -e @'
import { join } from 'node:path';
import { writeWindowsInstallerHandoff } from './dist/update/windows-update-handoff.js';
import { launchUpdateProcess } from './dist/update/launch-update-process.js';
const plan = writeWindowsInstallerHandoff({
  scriptPath: join(process.env.HUB_UPDATE_DIR, 'recovery-check', 'Install Gaurav POS Update.ps1'),
  logPath: join(process.env.HUB_UPDATE_DIR, 'install-handoff.log'),
  parentPid: process.pid,
  appExecutablePath: process.env.SMOKE_APP_PATH,
  installer: { filePath: process.env.ComSpec, args: ['/d', '/c', 'exit', '7'] }
});
await launchUpdateProcess(plan, process.env.HUB_UPDATE_DIR);
'@
    if ($LASTEXITCODE -ne 0) { throw "Recovery helper launch failed" }
  } finally { Pop-Location }
  Wait-ForHub
  $headers = @{ "x-device-token" = $env:HUB_ADMIN_TOKEN }
  $status = Invoke-RestMethod "http://127.0.0.1:43737/system/update/status" -Headers $headers
  if ($status.online.status -ne 'error' -or !$status.online.message.Contains('exit code 7')) { throw "Recovered Hub did not explain the failed installer" }
  if ($status.appVersion -ne $version) { throw "Failed installer changed the app version" }
  $reportPath = Join-Path $env:HUB_UPDATE_DIR 'last-update-error.json'
  $failure = Get-Content $reportPath -Raw | ConvertFrom-Json
  if (!$failure.message.Contains('exit code 7') -or !$failure.occurredAt) { throw "Installer failure was not persisted" }
  $helperLog = Get-Content (Join-Path $env:HUB_UPDATE_DIR 'recovery-check/startup.log') -Raw
  if (!$helperLog.Contains('PowerShell helper started, PID') -or !$helperLog.Contains('Reopening Hub after update failure')) { throw "Recovery milestones were not logged" }
  $windows = @(Get-Process -Name 'Gaurav POS Hub' | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -ne 1) { throw "Recovery opened duplicate Hub windows" }
  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"pin":"4321"}' | Out-Null
  $result = @{ installerExitCode = 7; reopenedHub = $true; visibleError = $status.online.message; managerPinPreserved = $true; singleWindow = $true }
  $result | ConvertTo-Json | Set-Content (Join-Path $root 'failed-installer-recovery.json')
  Stop-HubGracefully
  node (Join-Path $PSScriptRoot 'test-windows-ui.cjs') $appPath $root '--recovery-only'
  if ($LASTEXITCODE -ne 0) { throw "Recovered Hub did not show the installer error on screen" }
  Copy-Item (Join-Path $root 'windows-ui-audit.json') (Join-Path $root 'recovery-ui-audit.json')
  Remove-Item -LiteralPath $reportPath
  return $result
}

function Test-OnlineHubUpdate {
  # Observe the real public feed; neither the UI nor production updater receives
  # a feed override. Published-source mode uses the original shipped binary.
  $sourceVersion = if ($PublishedSourceVersion) { $PublishedSourceVersion } else { $FixtureVersion }
  $githubHeaders = @{ Accept = "application/vnd.github+json"; "User-Agent" = "Gaurav-POS-Windows-Smoke" }
  if ($env:GH_TOKEN) { $githubHeaders.Authorization = "Bearer $env:GH_TOKEN" }
  $release = Invoke-RestMethod "https://api.github.com/repos/shubham909090/Open-POS/releases/latest" -Headers $githubHeaders
  if ($release.tag_name -ne "hub-v$OnlineTargetVersion" -or $release.draft -or $release.prerelease) { throw "Actual latest stable feed is not hub-v$OnlineTargetVersion" }
  $checksums = @($release.assets | Where-Object { $_.name -eq "SHA256SUMS" })
  if ($checksums.Count -ne 1) { throw "Official target must contain SHA256SUMS" }
  $checksumPath = Join-Path $root "online-SHA256SUMS.log"
  Invoke-WebRequest $checksums[0].browser_download_url -OutFile $checksumPath
  $installerSums = [regex]::Matches((Get-Content $checksumPath -Raw), '(?m)^([a-fA-F0-9]{64})  ([^\r\n]+\.exe)\r?$')
  if ($installerSums.Count -ne 1) { throw "Expected one official Windows installer checksum" }
  $expectedHash = $installerSums[0].Groups[1].Value
  $officialInstaller = $installerSums[0].Groups[2].Value
  if (@($release.assets | Where-Object { $_.name -eq $officialInstaller }).Count -ne 1) { throw "Checksummed installer is missing from the official target" }
  @{ target = $OnlineTargetVersion; tag = $release.tag_name; releaseId = $release.id; url = $release.html_url; installer = $officialInstaller; sha256 = $expectedHash } |
    ConvertTo-Json | Set-Content (Join-Path $root "online-release-target.json")

  $attemptsBefore = @(Get-ChildItem $env:HUB_UPDATE_DIR -Directory -Filter "handoff-*" | Select-Object -ExpandProperty FullName)
  $backupsBefore = @(Get-ChildItem $env:HUB_BACKUP_DIR -File -Filter "*.sqlite" | Select-Object -ExpandProperty FullName)
  $logPath = Join-Path $env:HUB_UPDATE_DIR "install-handoff.log"
  $logBefore = if (Test-Path $logPath) { [string](Get-Content $logPath -Raw) } else { "" }
  $uiArgs = @((Join-Path $PSScriptRoot "test-windows-ui.cjs"), $appPath, $root, $OnlineTargetVersion)
  if ($PublishedSourceVersion) { $uiArgs += "--update-only" }
  node @uiArgs
  if ($LASTEXITCODE -ne 0) { throw "Real online Update app button audit failed" }
  $ui = Get-Content (Join-Path $root "windows-ui-audit.json") -Raw | ConvertFrom-Json
  if (!$ui.passed -or $ui.onlineButton.route -ne "/system/update/online/install" -or !$ui.onlineButton.oldProcessExited -or $ui.onlineButton.requestedTarget -ne $OnlineTargetVersion) { throw "Online UI click/process-exit evidence is missing" }
  if (Get-Process -Id $ui.onlineButton.oldPid -ErrorAction SilentlyContinue) { throw "Online update did not exit the fixture process" }

  $attempts = @(Get-ChildItem $env:HUB_UPDATE_DIR -Directory -Filter "handoff-*" | Where-Object { $_.FullName -notin $attemptsBefore })
  if ($attempts.Count -ne 1) { throw "Expected one new online helper attempt" }
  $attempt = $attempts[0].FullName
  if (!(Test-Path (Join-Path $attempt "ready"))) { throw "Online helper never acknowledged readiness" }
  if ((Get-Content (Join-Path $attempt "decision") -Raw) -ne "go") { throw "Online helper was not authorized" }
  if (!(Get-Content (Join-Path $attempt "startup.log") -Raw).Contains("helper ready; shutdown authorized")) { throw "Online helper readiness was not logged" }
  $statePath = Join-Path $env:HUB_UPDATE_DIR "app-update-state.json"
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
  $backupPath = $state.previous.preUpdateBackupPath
  if ($state.previous.version -ne $sourceVersion -or !$backupPath -or $backupPath -in $backupsBefore -or !(Test-Path $backupPath) -or (Get-Item $backupPath).Length -le 0) { throw "Online update did not create a new source database backup" }

  $deadline = (Get-Date).AddSeconds(180)
  $newLog = ""
  do {
    if (Test-Path $logPath) {
      $allLog = [string](Get-Content $logPath -Raw)
      if ($allLog.StartsWith($logBefore)) { $newLog = $allLog.Substring($logBefore.Length) }
    }
    if ($newLog.Contains("Update installer completed successfully.")) { break }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  if (!$newLog.Contains("Update installer completed successfully.")) { throw "Online installer did not complete" }
  $newLog | Set-Content (Join-Path $root "online-update-handoff.log")
  Wait-ForHub
  $reopened = Get-Process -Name "Gaurav POS Hub" | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (!$reopened -or $reopened.Id -eq $ui.onlineButton.oldPid) { throw "Online update did not reopen a new Hub process" }
  if ((Get-HubVersion $appPath) -ne $OnlineTargetVersion) { throw "Online update installed the wrong version" }
  if (!(Get-UninstallerIntegrity $appPath).valid) { throw "Online update corrupted the uninstaller" }
  $headers = @{ "x-device-token" = $env:HUB_ADMIN_TOKEN }
  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $headers -ContentType "application/json" -Body '{"pin":"4321"}' | Out-Null
  $status = Invoke-RestMethod "http://127.0.0.1:43737/system/update/status" -Headers $headers
  if ($status.appVersion -ne $OnlineTargetVersion -or !$status.baselineRegistered -or $status.pending -or $status.current.version -ne $OnlineTargetVersion) { throw "Online target did not finalize its update state" }
  if (!(Test-Path $status.current.installerPath -PathType Leaf)) { throw "Downloaded online installer cache is missing" }
  $cachedHash = (Get-FileHash $status.current.installerPath -Algorithm SHA256).Hash
  if ($cachedHash -ne $expectedHash -or $status.current.manifest.installer.sha256 -ne $expectedHash) { throw "Downloaded installer does not match official SHA256SUMS" }
  $result = @{
    route = $ui.onlineButton.route; fixtureVersion = $sourceVersion; targetVersion = $OnlineTargetVersion
    internalFixture = !$PublishedSourceVersion; historicalPublishedFixtureUpdaterTested = [bool]$PublishedSourceVersion; onlineFeedTested = $true
    helperReady = $true; helperAuthorized = $true; preUpdateBackup = Split-Path $backupPath -Leaf
    previousPid = $ui.onlineButton.oldPid; reopenedPid = $reopened.Id; managerPinPreserved = $true
    installerSha256 = $cachedHash; installerMatchesOfficialChecksums = $true; pendingCleared = $true
  }
  $result | ConvertTo-Json | Set-Content (Join-Path $root "online-update-result.json")
  return $result
}

try {
  if ($PublishedSourceVersion) {
    if ($FixtureVersion -or !$OnlineTargetVersion) { throw "Published source requires an online target and cannot use an internal fixture" }
    if ($PublishedSourceVersion -notmatch '^\d+\.\d+\.\d+$' -or $OnlineTargetVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$PublishedSourceVersion -ge [version]$OnlineTargetVersion) { throw "Published source must be older than the stable target" }
    $PreviousVersion = $PublishedSourceVersion
  } elseif ([bool]$FixtureVersion -ne [bool]$OnlineTargetVersion) { throw "Supply both FixtureVersion and OnlineTargetVersion or neither" }
  if ($FixtureVersion) {
    if ($FixtureVersion -notmatch '^\d+\.\d+\.\d+$' -or $OnlineTargetVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Online test versions must be stable x.y.z versions" }
    if ([version]$FixtureVersion -ge [version]$OnlineTargetVersion -or $version -ne $FixtureVersion) { throw "Build the older internal fixture before running the online update audit" }
  }
  gh release download "hub-v$PreviousVersion" --repo shubham909090/Open-POS --pattern "Gaurav-POS-Hub-Setup-$PreviousVersion.exe" --dir $root
  if ($LASTEXITCODE -ne 0) { throw "Previous installer download failed" }
  $previousInstaller = Join-Path $root "Gaurav-POS-Hub-Setup-$PreviousVersion.exe"
  if ($PublishedSourceVersion) {
    $release = Invoke-RestMethod "https://api.github.com/repos/shubham909090/Open-POS/releases/tags/hub-v$PublishedSourceVersion"
    $asset = @($release.assets | Where-Object name -eq (Split-Path $previousInstaller -Leaf))
    if ($asset.Count -ne 1 -or !$asset[0].digest -or "sha256:$((Get-FileHash $previousInstaller -Algorithm SHA256).Hash.ToLowerInvariant())" -ne $asset[0].digest) { throw "Published source installer checksum mismatch" }
    @{ sourceVersion = $PublishedSourceVersion; installerSha256 = $asset[0].digest; publishedBinaryUnmodified = $true } | ConvertTo-Json | Set-Content (Join-Path $root "published-source.json")
  }
  $install = Start-Process $previousInstaller -ArgumentList "/S" -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "Previous install failed: $($install.ExitCode)" }
  $appPath = Find-InstalledHub
  if ((Get-HubVersion $appPath) -ne $PreviousVersion) { throw "Previous version was not installed" }
  $legacyIntegrity = Get-UninstallerIntegrity $appPath

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

  if ($PublishedSourceVersion) {
    New-Item -ItemType Directory -Force $env:HUB_UPDATE_DIR, $env:HUB_BACKUP_DIR | Out-Null
    $baselineInstaller = Join-Path $root "Gaurav POS Hub Setup $PublishedSourceVersion.exe"
    Copy-Item $previousInstaller $baselineInstaller
    $baselineBody = @{ installerPath = $baselineInstaller } | ConvertTo-Json
    Invoke-RestMethod "http://127.0.0.1:43737/system/update/register-installer-baseline" -Method Post -Headers $headers -ContentType "application/json" -Body $baselineBody | Out-Null
    Stop-HubGracefully
    $onlineUpdate = Test-OnlineHubUpdate
    Stop-HubGracefully
    $selfTest = Start-Process $appPath -ArgumentList "--self-test-sqlite" -PassThru -Wait
    if ($selfTest.ExitCode -ne 0) { throw "Installed SQLite self-test failed" }
    @{ previousVersion = $PreviousVersion; installedVersion = $OnlineTargetVersion; onlineUpdate = $onlineUpdate; databasePreserved = $true; sqliteSelfTest = "passed" } | ConvertTo-Json | Set-Content (Join-Path $root "result.json")
    return
  }

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
  $readyDeadline = (Get-Date).AddSeconds(15)
  while (!(Test-Path $plan.handoff.readyPath) -and (Get-Date) -lt $readyDeadline) { Start-Sleep -Milliseconds 100 }
  if (!(Test-Path $plan.handoff.readyPath)) {
    Set-Content -LiteralPath $plan.handoff.decisionPath -Value 'cancel' -NoNewline
    throw 'Update helper did not become ready'
  }
  if ((Get-HubVersion $appPath) -ne $PreviousVersion) { throw "Installer ran before the old app exited" }
  # Name Path/Value explicitly: PowerShell's dynamic -NoNewline parameter can
  # reverse positional binding and create a file named "go" in the current dir.
  Set-Content -LiteralPath $plan.handoff.decisionPath -Value 'go' -NoNewline
  if ([System.IO.File]::ReadAllText($plan.handoff.decisionPath) -ne 'go') { throw 'Smoke helper authorization was not written correctly' }
  Write-Host "Authorized smoke helper via $($plan.handoff.decisionPath)"
  if (!$oldApp.CloseMainWindow()) { throw "Could not request a graceful Hub shutdown" }
  if (!$oldApp.WaitForExit(120000)) { throw "Old Hub did not exit cleanly" }
  if (!$handoff.WaitForExit(180000)) { throw "Update handoff timed out" }
  if ($handoff.ExitCode -ne 0) { throw "Update handoff failed: $($handoff.ExitCode)" }
  if ((Get-HubVersion $appPath) -ne $version) { throw "Candidate version was not installed" }
  if (!(Get-UninstallerIntegrity $appPath).valid) { throw "New uninstaller integrity check failed" }
  Wait-ForHub

  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $headers -ContentType "application/json" -Body '{"pin":"4321"}' | Out-Null
  Stop-HubGracefully
  # The freshly installed uninstaller must also support the next replacement.
  $repeatInstall = Start-Process $env:SMOKE_INSTALLER -ArgumentList '/S', '--updated' -PassThru
  if (!$repeatInstall.WaitForExit(120000)) { throw "Normal reinstall timed out" }
  if ($repeatInstall.ExitCode -ne 0) { throw "Normal reinstall failed: $($repeatInstall.ExitCode)" }
  if ((Get-HubVersion $appPath) -ne $version) { throw "Normal reinstall changed package version" }
  if (!(Get-UninstallerIntegrity $appPath).valid) { throw "Reinstalled uninstaller integrity check failed" }
  Start-Process $appPath | Out-Null
  Wait-ForHub
  Invoke-RestMethod "http://127.0.0.1:43737/admin/session/unlock" -Method Post -Headers $headers -ContentType "application/json" -Body '{"pin":"4321"}' | Out-Null
  $packagedUpdate = Test-PackagedHubUpdate
  Stop-HubGracefully
  $failureRecovery = Test-FailedInstallerRecovery
  $installedVersion = $version
  $onlineUpdate = $null
  if ($OnlineTargetVersion) {
    $onlineUpdate = Test-OnlineHubUpdate
    $installedVersion = $OnlineTargetVersion
    Stop-HubGracefully
  } else {
    node (Join-Path $PSScriptRoot "test-windows-ui.cjs") $appPath $root
    if ($LASTEXITCODE -ne 0) { throw "Packaged Windows UI audit failed" }
  }
  $selfTest = Start-Process $appPath -ArgumentList "--self-test-sqlite" -PassThru -Wait
  if ($selfTest.ExitCode -ne 0) { throw "Installed SQLite self-test failed" }
  @{ previousVersion = $PreviousVersion; installedVersion = $installedVersion; legacyUninstallerIntegrity = $legacyIntegrity; normalReinstall = "passed"; packagedUpdate = $packagedUpdate; failureRecovery = $failureRecovery; onlineUpdate = $onlineUpdate; databasePreserved = $true; sqliteSelfTest = "passed" } |
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
  if ($appPath -and (Test-Path $appPath)) {
    Get-ChildItem (Split-Path $appPath -Parent) -Recurse -File | ForEach-Object {
      try {
        $stream = [System.IO.File]::Open($_.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $stream.Dispose()
      } catch { [pscustomobject]@{ path = $_.TargetObject; error = $_.Exception.Message } }
    } | ConvertTo-Json | Set-Content (Join-Path $root "file-access-errors.json")
  }
  throw $failure
} finally {
  if (Test-Path (Join-Path $root "install-handoff.log")) { Get-Content (Join-Path $root "install-handoff.log") }
  Stop-Transcript
}
