import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, win32 } from "node:path";
import { Buffer } from "node:buffer";
import { updateHandoffTiming } from "../config/update-handoff.js";

export const UPDATE_FAILURE_FILE = "last-update-error.json";

export interface UpdateLaunchPlan {
  filePath: string;
  args: string[];
  handoff?: {
    readyPath: string;
    decisionPath: string;
    startupLogPath: string;
  };
}

export interface WindowsHandoffScriptInput {
  scriptPath: string;
  waitMessage: string;
  afterWaitMilliseconds: number;
  afterWaitLines: string[];
  pauseMessage?: string;
  copyShortcut?: boolean;
}

export function writeWindowsInstallerHandoff(input: {
  scriptPath: string;
  logPath: string;
  installer: UpdateLaunchPlan;
  appExecutablePath: string;
  parentPid: number;
}): UpdateLaunchPlan {
  const readyPath = join(dirname(input.scriptPath), "ready");
  const decisionPath = join(dirname(input.scriptPath), "decision");
  const startupLogPath = join(dirname(input.scriptPath), "startup.log");
  const failurePath = join(dirname(input.logPath), UPDATE_FAILURE_FILE);
  const appName = psQuote(win32.basename(input.appExecutablePath, ".exe"));
  const appPath = psQuote(input.appExecutablePath);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$exitCode = 0",
    "$transcriptStarted = $false",
    "$decision = ''",
    "function Write-HandoffLog([string]$message) {",
    "  try {",
    `    [System.IO.File]::AppendAllText(${psQuote(startupLogPath)}, ([DateTime]::UtcNow.ToString('o') + ' ' + $message + [Environment]::NewLine))`,
    "  } catch {}",
    "}",
    "Write-HandoffLog \"PowerShell helper started, PID $PID\"",
    "try {",
    `  Start-Transcript -Path ${psQuote(input.logPath)} -Append`,
    "  $transcriptStarted = $true",
    `  [System.IO.File]::WriteAllText(${psQuote(readyPath)}, 'ready')`,
    "  Write-HandoffLog 'Helper ready; waiting for authorization.'",
    `  $deadline = (Get-Date).AddSeconds(${updateHandoffTiming.decisionTimeoutSeconds})`,
    "  while ($decision -eq '' -and (Get-Date) -lt $deadline) {",
    `    if (Test-Path -LiteralPath ${psQuote(decisionPath)}) { $decision = [System.IO.File]::ReadAllText(${psQuote(decisionPath)}) }`,
    `    if ($decision -eq '') { Start-Sleep -Milliseconds ${updateHandoffTiming.pollIntervalMs} }`,
    "  }",
    "  if ($decision -ne 'go') { throw 'Update handoff was cancelled or not authorized. Hub can remain open.' }",
    "  Write-HandoffLog 'Shutdown authorized; waiting for Hub to exit.'",
    `  Write-Output 'Waiting for Gaurav POS Hub to exit...'`,
    `  Get-Process -Id ${input.parentPid} -ErrorAction SilentlyContinue | Wait-Process -Timeout ${updateHandoffTiming.appExitTimeoutSeconds} -ErrorAction Stop`,
    `  Get-Process -Name ${appName} -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${appPath} } | Wait-Process -Timeout ${updateHandoffTiming.appExitTimeoutSeconds} -ErrorAction Stop`,
    `  Write-Output 'Hub exited. Starting the update installer...'`,
    "  Write-HandoffLog 'Hub exited. Starting the update installer...'",
    `  $installer = ${startProcessCommand(input.installer)} -PassThru -ErrorAction Stop`,
    "  Write-Output \"Installer process: $($installer.Id)\"",
    "  Write-HandoffLog \"Installer process: $($installer.Id)\"",
    "  $installer.WaitForExit()",
    "  if ($installer.ExitCode -ne 0) { throw \"Installer failed with exit code $($installer.ExitCode).\" }",
    "  Write-Output 'Update installer completed successfully.'",
    "  Write-HandoffLog 'Update installer completed successfully.'",
    "} catch {",
    "  $failureMessage = $_.Exception.Message",
    "  $exitCode = 1",
    "  Write-HandoffLog (\"Update failed: \" + $failureMessage)",
    "  if ($decision -eq 'go') {",
    "    try {",
    "    $failure = @{ message = $failureMessage; occurredAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress",
    `    [System.IO.File]::WriteAllText(${psQuote(failurePath)}, $failure)`,
    "    } catch { Write-HandoffLog (\"Could not persist update failure: \" + $_.Exception.Message) }",
    "  }",
    "  try { Write-Output $failureMessage } catch {}",
    "  if ($decision -eq 'go') {",
    "    try {",
    // An unreadable process path cannot establish that Hub has stopped.
    `      $runningHub = @(Get-Process -Name ${appName} -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${appPath} -or -not $_.Path })`,
    `      if ($runningHub.Count -eq 0 -and (Test-Path -LiteralPath ${appPath} -PathType Leaf)) {`,
    "        Write-HandoffLog 'Reopening Hub after update failure...'",
    `        Start-Process -FilePath ${appPath} -ErrorAction Stop | Out-Null`,
    "      }",
    "    } catch { Write-HandoffLog (\"Could not reopen Hub: \" + $_.Exception.Message) }",
    "  }",
    "} finally {",
    "  if ($transcriptStarted) { try { Stop-Transcript } catch { Write-HandoffLog (\"Could not stop transcript: \" + $_.Exception.Message) } }",
    "}",
    "exit $exitCode"
  ].join("\r\n");
  mkdirSync(dirname(input.scriptPath), { recursive: true });
  // Windows PowerShell 5.1 needs a BOM to preserve Unicode installation paths.
  writeFileSync(input.scriptPath, `\uFEFF${script}`);
  return {
    filePath: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", input.scriptPath],
    handoff: { readyPath, decisionPath, startupLogPath }
  };
}

export function writeWindowsHandoffScript(input: WindowsHandoffScriptInput): string {
  const script = [
    "@echo off",
    "setlocal",
    `set "GPOS_PARENT_PID=${process.pid}"`,
    `echo ${input.waitMessage}`,
    powershellCommand(`Wait-Process -Id $env:GPOS_PARENT_PID -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds ${input.afterWaitMilliseconds}`),
    ...input.afterWaitLines,
    ...(input.pauseMessage ? [`echo ${input.pauseMessage}`, "pause"] : ["exit /b 0"])
  ].join("\r\n");

  mkdirSync(dirname(input.scriptPath), { recursive: true });
  writeFileSync(input.scriptPath, script);
  if (input.copyShortcut) writeWindowsShortcutCopy(input.scriptPath);
  return input.scriptPath;
}

export function startProcessCommand(plan: UpdateLaunchPlan): string {
  const args = plan.args.length > 0 ? ` -ArgumentList @(${plan.args.map(psQuote).join(",")})` : "";
  return `Start-Process -FilePath ${psQuote(plan.filePath)}${args}`;
}

export function powershellCommand(command: string): string {
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`;
}

export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeWindowsShortcutCopy(scriptPath: string): void {
  if (platform() !== "win32") return;
  const targets = [
    join(homedir(), "Desktop", basename(scriptPath)),
    join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", basename(scriptPath))
  ];
  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(scriptPath, target);
  }
}
