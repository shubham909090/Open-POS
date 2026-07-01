import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
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
