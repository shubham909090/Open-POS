import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, win32 } from "node:path";
import { Buffer } from "node:buffer";

export interface UpdateLaunchPlan {
  filePath: string;
  args: string[];
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
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$exitCode = 0",
    `Start-Transcript -Path ${psQuote(input.logPath)} -Append`,
    "try {",
    `  Write-Output 'Waiting for Gaurav POS Hub to exit...'`,
    `  Get-Process -Id ${input.parentPid} -ErrorAction SilentlyContinue | Wait-Process -Timeout 120 -ErrorAction Stop`,
    `  Get-Process -Name ${psQuote(win32.basename(input.appExecutablePath, ".exe"))} -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${psQuote(input.appExecutablePath)} } | Wait-Process -Timeout 120 -ErrorAction Stop`,
    `  Write-Output 'Hub exited. Starting the update installer...'`,
    `  $installer = ${startProcessCommand(input.installer)} -PassThru -ErrorAction Stop`,
    "  $installer.WaitForExit()",
    "  if ($installer.ExitCode -ne 0) { throw \"Installer failed with exit code $($installer.ExitCode).\" }",
    "  Write-Output 'Update installer completed successfully.'",
    "} catch {",
    "  Write-Output ($_ | Out-String)",
    "  $exitCode = 1",
    "} finally {",
    "  Stop-Transcript",
    "}",
    "exit $exitCode"
  ].join("\r\n");
  mkdirSync(dirname(input.scriptPath), { recursive: true });
  writeFileSync(input.scriptPath, script);
  return {
    filePath: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", input.scriptPath]
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
