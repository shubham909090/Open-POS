import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SystemPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: string;
}

export async function listSystemPrinters(): Promise<SystemPrinterInfo[]> {
  if (process.platform === "win32") return listWindowsPrinters();
  return listUnixPrinters();
}

async function listWindowsPrinters(): Promise<SystemPrinterInfo[]> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-Printer | Select-Object Name,PrinterStatus,Default | ConvertTo-Json -Compress"
  ]);
  const parsed = JSON.parse(stdout.trim() || "[]") as
    | Array<{ Name: string; PrinterStatus?: string; Default?: boolean }>
    | { Name: string; PrinterStatus?: string; Default?: boolean };
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((printer) => ({
    name: printer.Name,
    displayName: printer.Name,
    isDefault: Boolean(printer.Default),
    status: printer.PrinterStatus
  }));
}

async function listUnixPrinters(): Promise<SystemPrinterInfo[]> {
  const [{ stdout: printersStdout }, defaultResult] = await Promise.all([
    execFileAsync("lpstat", ["-p"]),
    execFileAsync("lpstat", ["-d"]).catch(() => ({ stdout: "" }))
  ]);
  const defaultName = defaultResult.stdout.match(/system default destination:\s+(.+)/)?.[1]?.trim();
  return printersStdout
    .split("\n")
    .map((line) => line.match(/^printer\s+(\S+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1]!,
      displayName: match[1]!,
      isDefault: match[1] === defaultName,
      status: match[2]?.trim()
    }));
}
