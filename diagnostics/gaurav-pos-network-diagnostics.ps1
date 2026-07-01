param(
  [string]$HubIp = "",
  [int]$HubPort = 3737,
  [string]$PrinterIp = "",
  [int]$PrinterPort = 9100
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$desktop = [Environment]::GetFolderPath("Desktop")
$outDir = Join-Path $desktop "gaurav-pos-diagnostics-$timestamp"
$report = Join-Path $outDir "report.txt"
$zipPath = Join-Path $desktop "gaurav-pos-diagnostics-$timestamp.zip"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Add-Line {
  param([string]$Text = "")
  Add-Content -Path $report -Value $Text
}

function Add-Section {
  param([string]$Title)
  Add-Line ""
  Add-Line ("=" * 90)
  Add-Line $Title
  Add-Line ("=" * 90)
}

function Run-Cmd {
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

function Redact-Text {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }
  $secretKeys = @(
    "POS_SYNC_SECRET",
    "HUB_ADMIN_TOKEN",
    "CONVEX_URL",
    "CONVEX_HTTP_URL",
    "HUB_CONNECTION_SYNC_SECRET",
    "syncSecret",
    "sync_secret",
    "secret",
    "token",
    "password",
    "key"
  )
  $result = $Text
  foreach ($key in $secretKeys) {
    $escapedKey = [regex]::Escape($key)
    $linePattern = "(?im)^(\s*#?\s*$escapedKey\s*=\s*).+$"
    $jsonPattern = '(?i)(' + $escapedKey + '[''"]?\s*[:=]\s*[''"]?)[^,''"]+'
    $result = $result -replace $linePattern, '$1<REDACTED>'
    $result = $result -replace $jsonPattern, '$1<REDACTED>'
  }
  return $result
}

function Test-Http {
  param([string]$Url)
  Add-Line "URL: $Url"
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 6
    $sw.Stop()
    Add-Line "StatusCode: $($response.StatusCode)"
    Add-Line "ElapsedMs: $($sw.ElapsedMilliseconds)"
    Add-Line "Body:"
    Add-Line (Redact-Text ($response.Content | Out-String))
  } catch {
    Add-Line "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
      try {
        Add-Line "HTTP Status: $([int]$_.Exception.Response.StatusCode) $($_.Exception.Response.StatusDescription)"
      } catch {}
    }
  }
  Add-Line ""
}

function Test-Tcp {
  param(
    [string]$HostName,
    [int]$Port
  )
  if ([string]::IsNullOrWhiteSpace($HostName)) { return }
  Add-Line "Target: $HostName`:$Port"
  try {
    Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Detailed 2>&1 |
      Out-String -Width 300 | Add-Content -Path $report
  } catch {
    Add-Line "ERROR: $($_.Exception.Message)"
  }
  Add-Line ""
}

Add-Line "Gaurav POS Network Diagnostics"
Add-Line "Generated: $(Get-Date -Format o)"
Add-Line "Computer: $env:COMPUTERNAME"
Add-Line "User: $env:USERNAME"
Add-Line "HubIp parameter: $HubIp"
Add-Line "HubPort parameter: $HubPort"
Add-Line "PrinterIp parameter: $PrinterIp"
Add-Line "PrinterPort parameter: $PrinterPort"

Run-Cmd "Windows Version" {
  Get-ComputerInfo |
    Select-Object CsName, WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer, OsArchitecture, OsUptime
}

Run-Cmd "Current Network Profiles" {
  Get-NetConnectionProfile |
    Select-Object Name, InterfaceAlias, InterfaceIndex, NetworkCategory, IPv4Connectivity, IPv6Connectivity
}

Run-Cmd "IP Addresses" {
  Get-NetIPConfiguration |
    Select-Object InterfaceAlias, InterfaceDescription, IPv4Address, IPv4DefaultGateway, DNSServer |
    Format-List
}

Run-Cmd "ipconfig /all" {
  ipconfig /all
}

Run-Cmd "Routes" {
  route print
}

Run-Cmd "DNS Client Servers" {
  Get-DnsClientServerAddress | Format-Table -AutoSize
}

Run-Cmd "ARP Neighbor Table" {
  arp -a
}

Run-Cmd "Wi-Fi Interface State" {
  netsh wlan show interfaces
}

Run-Cmd "Firewall Profiles" {
  Get-NetFirewallProfile |
    Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, AllowInboundRules, NotifyOnListen |
    Format-Table -AutoSize
}

Run-Cmd "Firewall Rules Mentioning Gaurav, POS, Electron, Node, Or Port 3737" {
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object {
      $_.DisplayName -match "Gaurav|POS|Electron|Node|3737" -or
      $_.Name -match "Gaurav|POS|Electron|Node|3737"
    } |
    Select-Object DisplayName, Name, Enabled, Direction, Action, Profile |
    Format-Table -AutoSize
}

Run-Cmd "Firewall Port Filters For 3737" {
  Get-NetFirewallPortFilter -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq "$HubPort" -or $_.RemotePort -eq "$HubPort" } |
    Format-List *
}

Run-Cmd "TCP Listeners On Hub Port" {
  Get-NetTCPConnection -LocalPort $HubPort -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess |
    Format-Table -AutoSize
}

Run-Cmd "netstat Hub Port" {
  netstat -ano | findstr ":$HubPort"
}

Run-Cmd "Processes Owning Hub Port" {
  $pids = Get-NetTCPConnection -LocalPort $HubPort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    Get-Process -Id $pidValue -ErrorAction SilentlyContinue |
      Select-Object Id, ProcessName, Path, StartTime
  }
}

Run-Cmd "Likely Gaurav / Electron / Node Processes" {
  Get-Process |
    Where-Object { $_.ProcessName -match "Gaurav|Electron|node|Gaurav POS|POS" -or $_.Path -match "Gaurav|POS|hub|electron|node" } |
    Select-Object Id, ProcessName, Path, StartTime |
    Format-List
}

$localIPv4s = @()
try {
  $localIPv4s = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -ExpandProperty IPAddress -Unique
} catch {}

Add-Section "Hub HTTP Health Checks From This PC"
Test-Http "http://127.0.0.1:$HubPort/health"
Test-Http "http://localhost:$HubPort/health"
foreach ($ip in $localIPv4s) {
  Test-Http "http://$ip`:$HubPort/health"
}
if (-not [string]::IsNullOrWhiteSpace($HubIp)) {
  Test-Http "http://$HubIp`:$HubPort/health"
  Test-Http "http://$HubIp`:$HubPort/admin/session/status"
}

Add-Section "Hub TCP Checks"
Test-Tcp "127.0.0.1" $HubPort
foreach ($ip in $localIPv4s) {
  Test-Tcp $ip $HubPort
}
if (-not [string]::IsNullOrWhiteSpace($HubIp)) {
  Test-Tcp $HubIp $HubPort
}

Run-Cmd "Gateway Connectivity" {
  $gateways = Get-NetIPConfiguration |
    ForEach-Object { $_.IPv4DefaultGateway.NextHop } |
    Where-Object { $_ } |
    Select-Object -Unique
  foreach ($gw in $gateways) {
    "Gateway: $gw"
    ping -n 3 $gw
    Test-NetConnection $gw -InformationLevel Detailed
  }
}

Run-Cmd "Internet Sanity Check" {
  "Ping 1.1.1.1"
  ping -n 3 1.1.1.1
  "DNS lookup convex.dev"
  nslookup convex.dev
}

Run-Cmd "Installed Printers" {
  Get-Printer |
    Select-Object Name, PrinterStatus, Type, DriverName, PortName, Shared, ShareName, Published, Default, WorkOffline |
    Format-Table -AutoSize
}

Run-Cmd "Printer Ports" {
  Get-PrinterPort |
    Select-Object Name, PrinterHostAddress, PortNumber, Protocol, Description |
    Format-Table -AutoSize
}

Run-Cmd "Print Spooler Status" {
  Get-Service Spooler | Format-List *
}

Run-Cmd "Recent PrintService Errors" {
  Get-WinEvent -LogName "Microsoft-Windows-PrintService/Operational" -MaxEvents 80 -ErrorAction SilentlyContinue |
    Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message |
    Format-List
}

Run-Cmd "Recent System Network-ish Events" {
  Get-WinEvent -LogName System -MaxEvents 120 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match "Tcpip|Dhcp|DNS|Netwtw|WLAN|NlaSvc|e1|Realtek|Kernel-Network" -or $_.Message -match "DHCP|DNS|network|IP address|adapter|gateway" } |
    Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message |
    Format-List
}

Add-Section "Printer TCP Checks"
if (-not [string]::IsNullOrWhiteSpace($PrinterIp)) {
  Test-Tcp $PrinterIp $PrinterPort
}
try {
  $printerHosts = Get-PrinterPort -ErrorAction SilentlyContinue |
    Where-Object { $_.PrinterHostAddress } |
    Select-Object -ExpandProperty PrinterHostAddress -Unique
  foreach ($ph in $printerHosts) {
    Test-Tcp $ph $PrinterPort
  }
} catch {
  Add-Line "Could not enumerate printer host addresses: $($_.Exception.Message)"
}

Add-Section "Gaurav POS Config Files, Redacted"
$candidateConfigPaths = @(
  $env:HUB_CONFIG_FILE,
  $env:GAURAV_POS_CONFIG,
  $(if ($env:APPDATA) { Join-Path $env:APPDATA "Gaurav POS Hub\hub.env" }),
  $(if ($env:PROGRAMDATA) { Join-Path $env:PROGRAMDATA "Gaurav POS Hub\hub.env" }),
  $(Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Gaurav POS Hub\hub.env"),
  $(Join-Path (Get-Location) "hub.env"),
  $(Join-Path (Get-Location) ".env.local")
) | Where-Object { $_ } | Select-Object -Unique

foreach ($path in $candidateConfigPaths) {
  Add-Line "PATH: $path"
  if (Test-Path $path) {
    Add-Line "EXISTS: yes"
    try {
      Add-Line (Redact-Text (Get-Content $path -Raw))
    } catch {
      Add-Line "READ ERROR: $($_.Exception.Message)"
    }
  } else {
    Add-Line "EXISTS: no"
  }
  Add-Line ""
}

Run-Cmd "AppData Gaurav POS Hub Folder Listing" {
  $paths = @(
    $(if ($env:APPDATA) { Join-Path $env:APPDATA "Gaurav POS Hub" }),
    $(if ($env:PROGRAMDATA) { Join-Path $env:PROGRAMDATA "Gaurav POS Hub" })
  ) | Where-Object { $_ } | Select-Object -Unique
  foreach ($p in $paths) {
    "PATH: $p"
    if (Test-Path $p) {
      Get-ChildItem $p -Force -Recurse -ErrorAction SilentlyContinue |
        Select-Object FullName, Length, LastWriteTime |
        Sort-Object FullName |
        Format-Table -AutoSize
    } else {
      "MISSING"
    }
  }
}

Add-Section "Summary Hints"
Add-Line "If 127.0.0.1 health works but LAN IP health fails: firewall/bind/interface issue on Hub PC."
Add-Line "If LAN IP health works here but fails on bottom PC/phone: router/subnet/Wi-Fi isolation/firewall path issue."
Add-Line "If /health works everywhere but mobile app fails: stale saved Hub URL, stale/revoked token, or pairing issue."
Add-Line "If orders/admin work but prints fail: printer must be reachable from Hub PC, not merely from browser PC."
Add-Line "USB printer on bottom PC needs Windows sharing and must be installed on Hub PC as system printer."
Add-Line "LAN ESC/POS printer should pass Test-NetConnection PRINTER_IP -Port 9100 from Hub PC."

try {
  Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force
} catch {
  Add-Line "ZIP ERROR: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Diagnostics complete."
Write-Host "Report folder: $outDir"
Write-Host "Zip file: $zipPath"
Write-Host "Send the zip file back."
