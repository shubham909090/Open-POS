import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PRINTER_DISCOVERY_CACHE_MS = 30_000;
const PRINTER_DISCOVERY_TIMEOUT_MS = 5_000;

export interface SystemPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: string;
}

let cachedPrinters: { at: number; printers: SystemPrinterInfo[] } | null = null;
let inFlightPrinters: Promise<SystemPrinterInfo[]> | null = null;

export async function listSystemPrinters(options: { forceRefresh?: boolean } = {}): Promise<SystemPrinterInfo[]> {
  const now = Date.now();
  if (!options.forceRefresh && cachedPrinters && now - cachedPrinters.at < PRINTER_DISCOVERY_CACHE_MS) return cachedPrinters.printers;
  if (inFlightPrinters) return inFlightPrinters;

  inFlightPrinters = (process.platform === "win32" ? listWindowsPrinters() : listUnixPrinters())
    .then((printers) => {
      cachedPrinters = { at: Date.now(), printers };
      return printers;
    })
    .finally(() => {
      inFlightPrinters = null;
    });
  return inFlightPrinters;
}

async function listWindowsPrinters(): Promise<SystemPrinterInfo[]> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-Printer | Select-Object Name,PrinterStatus,Default | ConvertTo-Json -Compress"
  ], { timeout: PRINTER_DISCOVERY_TIMEOUT_MS });
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
  const [printersResult, defaultResult] = await Promise.all([
    execFileAsync("lpstat", ["-p"], { timeout: PRINTER_DISCOVERY_TIMEOUT_MS }).catch((error: { stderr?: string; message?: string }) => {
      const output = `${error.stderr ?? ""}\n${error.message ?? ""}`;
      if (output.includes("No destinations added")) return { stdout: "" };
      throw error;
    }),
    execFileAsync("lpstat", ["-d"], { timeout: PRINTER_DISCOVERY_TIMEOUT_MS }).catch(() => ({ stdout: "" }))
  ]);
  const printersStdout = printersResult.stdout;
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
