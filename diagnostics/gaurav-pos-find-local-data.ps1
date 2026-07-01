param(
  [string]$StartDate = "2026-04-17",
  [string]$EndDate = "2026-06-29",
  [string]$AppExePath = "",
  [switch]$DeepSearch,
  [switch]$CopyCandidates,
  [int]$MaxScanMb = 512
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$desktop = [Environment]::GetFolderPath("Desktop")
$outDir = Join-Path $desktop "gaurav-pos-data-search-$timestamp"
$report = Join-Path $outDir "report.txt"
$copyDir = Join-Path $outDir "candidate-copies"
$zipPath = Join-Path $desktop "gaurav-pos-data-search-$timestamp.zip"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Add-Line {
  param([string]$Text = "")
  Add-Content -Path $report -Value $Text
  Write-Host $Text
}

function Add-Section {
  param([string]$Title)
  Add-Line ""
  Add-Line ("=" * 90)
  Add-Line $Title
  Add-Line ("=" * 90)
}

function Assert-BusinessDate {
  param(
    [string]$Name,
    [string]$Value
  )
  $parsed = [datetime]::MinValue
  if (
    [string]::IsNullOrWhiteSpace($Value) -or
    $Value -notmatch "^\d{4}-\d{2}-\d{2}$" -or
    -not [datetime]::TryParseExact($Value, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)
  ) {
    throw "$Name must be a valid date in yyyy-MM-dd format."
  }
}

function Invoke-Safe {
  param(
    [string]$Title,
    [scriptblock]$Command
  )
  Add-Section $Title
  try {
    & $Command 2>&1 | Out-String -Width 300 | Add-Content -Path $report
  } catch {
    Add-Line ("ERROR: " + $_.Exception.Message)
  }
}

function Test-ByteIndex {
  param(
    [byte[]]$Haystack,
    [byte[]]$Needle
  )
  if ($Needle.Length -eq 0 -or $Haystack.Length -lt $Needle.Length) { return $false }
  for ($i = 0; $i -le $Haystack.Length - $Needle.Length; $i++) {
    $matched = $true
    for ($j = 0; $j -lt $Needle.Length; $j++) {
      if ($Haystack[$i + $j] -ne $Needle[$j]) {
        $matched = $false
        break
      }
    }
    if ($matched) { return $true }
  }
  return $false
}

function Test-FileContainsAscii {
  param(
    [string]$Path,
    [string]$Text,
    [int64]$MaxBytes
  )
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  if (-not (Test-Path -LiteralPath $Path)) { return $false }

  $needle = [Text.Encoding]::ASCII.GetBytes($Text)
  $buffer = New-Object byte[] (1024 * 1024)
  $tail = New-Object byte[] 0
  $total = [int64]0
  $stream = $null

  try {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $total += $read
      $chunkLength = $tail.Length + $read
      $chunk = New-Object byte[] $chunkLength
      if ($tail.Length -gt 0) { [Array]::Copy($tail, 0, $chunk, 0, $tail.Length) }
      [Array]::Copy($buffer, 0, $chunk, $tail.Length, $read)
      if (Test-ByteIndex -Haystack $chunk -Needle $needle) { return $true }

      $keep = [Math]::Min($needle.Length - 1, $chunkLength)
      $tail = New-Object byte[] $keep
      if ($keep -gt 0) { [Array]::Copy($chunk, $chunkLength - $keep, $tail, 0, $keep) }
      if ($MaxBytes -gt 0 -and $total -ge $MaxBytes) { break }
    }
  } catch {
    return $false
  } finally {
    if ($stream) { $stream.Close() }
  }

  return $false
}

function Get-SafeFileName {
  param([string]$Path)
  return ($Path -replace "^[A-Za-z]:", "" -replace "[\\/:*?`"<>|]", "_").Trim("_")
}

function Copy-CandidateWithSidecars {
  param([string]$Path)
  New-Item -ItemType Directory -Path $copyDir -Force | Out-Null
  $base = Get-SafeFileName $Path
  foreach ($source in @($Path, "$Path-wal", "$Path-shm", "$Path-journal")) {
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $suffix = ""
    if ($source.EndsWith("-wal")) { $suffix = ".wal" }
    elseif ($source.EndsWith("-shm")) { $suffix = ".shm" }
    elseif ($source.EndsWith("-journal")) { $suffix = ".journal" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $copyDir "$base$suffix") -Force -ErrorAction SilentlyContinue
  }
}

function Get-SqliteSummary {
  param(
    [string]$SqliteExe,
    [string]$DbPath
  )
  $sql = @"
.headers on
.mode column
PRAGMA integrity_check;
SELECT 'pos_days' AS table_name, COUNT(*) AS count, MIN(business_date) AS min_date, MAX(business_date) AS max_date FROM pos_days;
SELECT 'daily_report_snapshots' AS table_name, COUNT(*) AS count, MIN(business_date) AS min_date, MAX(business_date) AS max_date FROM daily_report_snapshots;
SELECT 'orders' AS table_name, COUNT(*) AS count, MIN(date(created_at)) AS min_created_date, MAX(date(created_at)) AS max_created_date FROM orders;
SELECT 'bills' AS table_name, COUNT(*) AS count, MIN(date(created_at)) AS min_created_date, MAX(date(created_at)) AS max_created_date FROM bills;
SELECT 'payments' AS table_name, COUNT(*) AS count, MIN(date(created_at)) AS min_created_date, MAX(date(created_at)) AS max_created_date FROM payments;
SELECT p.business_date, p.status, COUNT(o.id) AS orders, COUNT(b.id) AS bills, COALESCE(SUM(b.final_total_paise),0) AS final_total_paise
FROM pos_days p
LEFT JOIN orders o ON o.pos_day_id = p.id
LEFT JOIN bills b ON b.order_id = o.id
WHERE p.business_date BETWEEN '$StartDate' AND '$EndDate'
GROUP BY p.id
ORDER BY p.business_date;
SELECT business_date, status, bill_count, final_sales_paise, finalized_at
FROM daily_report_snapshots
WHERE business_date BETWEEN '$StartDate' AND '$EndDate'
ORDER BY business_date;
"@
  try {
    return ($sql | & $SqliteExe -readonly $DbPath 2>&1 | Out-String -Width 300)
  } catch {
    return "SQLite query failed: $($_.Exception.Message)"
  }
}

function Read-EnvFileValue {
  param(
    [string]$Path,
    [string]$Key
  )
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
      $trimmed = $line.Trim()
      if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
      $match = [regex]::Match($trimmed, "^$([regex]::Escape($Key))\s*=\s*(.+)$")
      if (-not $match.Success) { continue }
      return $match.Groups[1].Value.Trim().Trim("'", '"')
    }
  } catch {
    return $null
  }
  return $null
}

try {
  Assert-BusinessDate -Name "StartDate" -Value $StartDate
  Assert-BusinessDate -Name "EndDate" -Value $EndDate
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

Add-Line "Gaurav POS Local Data Finder"
Add-Line "Generated: $(Get-Date -Format o)"
Add-Line "Computer: $env:COMPUTERNAME"
Add-Line "User: $env:USERNAME"
Add-Line "Date window: $StartDate to $EndDate"
Add-Line "AppExePath: $AppExePath"
Add-Line "DeepSearch: $DeepSearch"
Add-Line "CopyCandidates: $CopyCandidates"
Add-Line ""
Add-Line "Default current Hub database path is usually:"
Add-Line "  $env:APPDATA\Gaurav POS Hub\data\hub.sqlite"
Add-Line ""
Add-Line "Uninstalling/reinstalling the app normally removes app files, not this AppData database."
Add-Line "If the database was manually reset/deleted, search backups, other Windows users, and old app-data folders."

$roots = New-Object System.Collections.Generic.List[string]
foreach ($path in @(
  (Join-Path $env:APPDATA "Gaurav POS Hub"),
  (Join-Path $env:LOCALAPPDATA "Gaurav POS Hub"),
  (Join-Path $env:LOCALAPPDATA "Programs\Gaurav POS Hub"),
  (Join-Path $env:PROGRAMDATA "Gaurav POS Hub"),
  (Join-Path $env:USERPROFILE "Desktop"),
  (Join-Path $env:USERPROFILE "Documents"),
  (Join-Path $env:USERPROFILE "Downloads"),
  "C:\Gaurav POS Hub",
  "C:\Gaurav",
  "C:\POS",
  "C:\Program Files\Gaurav POS Hub",
  "C:\Program Files (x86)\Gaurav POS Hub"
)) {
  if ($path -and (Test-Path -LiteralPath $path)) { $roots.Add($path) }
}

if (-not [string]::IsNullOrWhiteSpace($AppExePath)) {
  Add-Section "App Exe Path"
  Add-Line $AppExePath
  if (Test-Path -LiteralPath $AppExePath) {
    $appExe = Get-Item -LiteralPath $AppExePath -ErrorAction SilentlyContinue
    if ($appExe) {
      Add-Line "Found app exe. Install folder:"
      Add-Line "  $($appExe.DirectoryName)"
      $roots.Add($appExe.DirectoryName)
      $parent = Split-Path -Parent $appExe.DirectoryName
      if ($parent -and (Test-Path -LiteralPath $parent)) { $roots.Add($parent) }
    }
  } else {
    Add-Line "App exe path does not exist on this machine."
  }
}

$configFiles = @(
  $env:HUB_CONFIG_FILE,
  $env:GAURAV_POS_CONFIG,
  (Join-Path $env:APPDATA "Gaurav POS Hub\hub.env"),
  (Join-Path $env:PROGRAMDATA "Gaurav POS Hub\hub.env"),
  (Join-Path $env:LOCALAPPDATA "Gaurav POS Hub\hub.env"),
  (Join-Path (Get-Location) "hub.env"),
  (Join-Path (Get-Location) ".env.local")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$explicitDbPaths = New-Object System.Collections.Generic.List[string]
Add-Section "Config Files"
if (-not $configFiles -or $configFiles.Count -eq 0) {
  Add-Line "No hub.env/config files found in standard locations."
} else {
  foreach ($configFile in $configFiles) {
    Add-Line $configFile
    $dbPath = Read-EnvFileValue -Path $configFile -Key "HUB_DATABASE_PATH"
    $backupPath = Read-EnvFileValue -Path $configFile -Key "HUB_BACKUP_DIR"
    if ($dbPath) {
      Add-Line "  HUB_DATABASE_PATH=$dbPath"
      $explicitDbPaths.Add($dbPath)
      $dbDir = Split-Path -Parent $dbPath
      if ($dbDir -and (Test-Path -LiteralPath $dbDir)) { $roots.Add($dbDir) }
    }
    if ($backupPath) {
      Add-Line "  HUB_BACKUP_DIR=$backupPath"
      if (Test-Path -LiteralPath $backupPath) { $roots.Add($backupPath) }
    }
  }
}

if ($DeepSearch) {
  foreach ($path in @("C:\Users", "C:\ProgramData", "C:\Program Files", "C:\Program Files (x86)")) {
    if (Test-Path -LiteralPath $path) { $roots.Add($path) }
  }
}

$roots = $roots | Select-Object -Unique
Add-Section "Search Roots"
$roots | ForEach-Object { Add-Line $_ }

$patterns = @("hub.sqlite", "*.sqlite", "*.sqlite3", "*.db", "*.db3")
$candidateMap = @{}
Add-Section "Searching"
foreach ($root in $roots) {
  Add-Line "Scanning: $root"
  foreach ($pattern in $patterns) {
    try {
      Get-ChildItem -LiteralPath $root -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
        ForEach-Object {
          $candidateMap[$_.FullName.ToLowerInvariant()] = $_
        }
    } catch {
      Add-Line "ERROR scanning $root : $($_.Exception.Message)"
    }
  }
}
foreach ($explicitDbPath in $explicitDbPaths) {
  if (Test-Path -LiteralPath $explicitDbPath) {
    $file = Get-Item -LiteralPath $explicitDbPath -ErrorAction SilentlyContinue
    if ($file) { $candidateMap[$file.FullName.ToLowerInvariant()] = $file }
  }
}

$maxBytes = [int64]$MaxScanMb * 1024 * 1024
$candidates = @()
foreach ($file in $candidateMap.Values) {
  $score = 0
  $path = $file.FullName
  if ($file.Name -ieq "hub.sqlite") { $score += 80 }
  if ($path -match "Gaurav POS Hub") { $score += 80 }
  if ($path -match "backup|pre-update|pre-restore") { $score += 30 }
  if (Test-FileContainsAscii -Path $path -Text "pos_days" -MaxBytes $maxBytes) { $score += 30; $hasPosDays = $true } else { $hasPosDays = $false }
  if (Test-FileContainsAscii -Path $path -Text "daily_report_snapshots" -MaxBytes $maxBytes) { $score += 30; $hasReports = $true } else { $hasReports = $false }
  if (Test-FileContainsAscii -Path $path -Text "orders" -MaxBytes $maxBytes) { $score += 10; $hasOrders = $true } else { $hasOrders = $false }
  if (Test-FileContainsAscii -Path $path -Text "bills" -MaxBytes $maxBytes) { $score += 10; $hasBills = $true } else { $hasBills = $false }
  if (Test-FileContainsAscii -Path $path -Text "2026-04" -MaxBytes $maxBytes) { $score += 80; $hasApril = $true } else { $hasApril = $false }
  if (Test-FileContainsAscii -Path $path -Text "2026-05" -MaxBytes $maxBytes) { $score += 40; $hasMay = $true } else { $hasMay = $false }
  if (Test-FileContainsAscii -Path $path -Text "2026-06" -MaxBytes $maxBytes) { $score += 20; $hasJune = $true } else { $hasJune = $false }

  $candidates += [pscustomobject]@{
    Score = $score
    Path = $path
    SizeMB = [math]::Round($file.Length / 1MB, 2)
    Created = $file.CreationTime
    Modified = $file.LastWriteTime
    HasApril2026 = $hasApril
    HasMay2026 = $hasMay
    HasJune2026 = $hasJune
    HasPosDays = $hasPosDays
    HasReports = $hasReports
    HasOrders = $hasOrders
    HasBills = $hasBills
  }
}

$ranked = $candidates | Sort-Object Score, Modified -Descending
Add-Section "Candidate SQLite Files"
if (-not $ranked -or $ranked.Count -eq 0) {
  Add-Line "No SQLite-like files found in searched locations."
} else {
  $ranked |
    Select-Object Score, SizeMB, Modified, HasApril2026, HasMay2026, HasJune2026, HasPosDays, HasReports, HasOrders, HasBills, Path |
    Format-Table -AutoSize |
    Out-String -Width 500 |
    Add-Content -Path $report
  $ranked |
    Select-Object Score, SizeMB, Modified, HasApril2026, HasMay2026, HasJune2026, Path |
    Format-Table -AutoSize
}

$sqliteCommand = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
if (-not $sqliteCommand) { $sqliteCommand = Get-Command sqlite3 -ErrorAction SilentlyContinue }

Add-Section "SQLite Table Summaries"
if (-not $sqliteCommand) {
  Add-Line "sqlite3.exe was not found on PATH, so only file search/date-string checks were run."
  Add-Line "If you install DB Browser for SQLite or sqlite3.exe, rerun this script for real table counts."
} else {
  Add-Line "Using sqlite3: $($sqliteCommand.Source)"
  foreach ($candidate in ($ranked | Where-Object { $_.Score -ge 80 } | Select-Object -First 20)) {
    Add-Line ""
    Add-Line "--- $($candidate.Path)"
    Add-Line (Get-SqliteSummary -SqliteExe $sqliteCommand.Source -DbPath $candidate.Path)
  }
}

if ($CopyCandidates) {
  Add-Section "Copied Candidate Files"
  foreach ($candidate in ($ranked | Where-Object { $_.Score -ge 80 } | Select-Object -First 20)) {
    Add-Line "Copying: $($candidate.Path)"
    Copy-CandidateWithSidecars -Path $candidate.Path
  }
  Add-Line "Copies are in: $copyDir"
}

Invoke-Safe "Installed Gaurav POS App Folders" {
  foreach ($path in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Gaurav POS Hub"),
    (Join-Path $env:APPDATA "Gaurav POS Hub"),
    (Join-Path $env:PROGRAMDATA "Gaurav POS Hub")
  )) {
    if (Test-Path -LiteralPath $path) {
      Get-Item -LiteralPath $path | Select-Object FullName, CreationTime, LastWriteTime
      Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue | Select-Object FullName, Length, CreationTime, LastWriteTime
    }
  }
}

Invoke-Safe "Windows Users" {
  Get-ChildItem -LiteralPath "C:\Users" -Directory -Force -ErrorAction SilentlyContinue |
    Select-Object FullName, CreationTime, LastWriteTime
}

try {
  Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force
  Add-Section "Done"
  Add-Line "Report folder: $outDir"
  Add-Line "Zip file: $zipPath"
} catch {
  Add-Section "Done"
  Add-Line "Report folder: $outDir"
  Add-Line "Zip failed: $($_.Exception.Message)"
}
