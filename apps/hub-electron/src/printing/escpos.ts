import net from "node:net";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export interface PrinterAdapter {
  print(target: PrintTarget): Promise<void>;
}

export interface PrintTarget {
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  payload: string;
}

export class DryRunPrinterAdapter implements PrinterAdapter {
  readonly printed: PrintTarget[] = [];

  async print(target: PrintTarget): Promise<void> {
    this.printed.push(target);
  }
}

export class LanEscposPrinterAdapter implements PrinterAdapter {
  async print(target: PrintTarget): Promise<void> {
    if (!target.printerHost || !target.printerPort) {
      throw new Error("No network printer configured for print job");
    }

    const data = Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      Buffer.from(target.payload, "utf8"),
      Buffer.from([0x1d, 0x56, 0x00])
    ]);

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: target.printerHost!, port: target.printerPort!, timeout: 5_000 }, () => {
        socket.write(data, (error) => {
          if (error) {
            reject(error);
            return;
          }
          socket.end();
        });
      });

      socket.on("close", () => resolve());
      socket.on("timeout", () => {
        socket.destroy(new Error(`Printer ${target.printerHost}:${target.printerPort} timed out`));
      });
      socket.on("error", reject);
    });
  }
}

export class SystemPrinterAdapter implements PrinterAdapter {
  private readonly execFileAsync = promisify(execFile);

  async print(target: PrintTarget): Promise<void> {
    if (!target.printerName) throw new Error("No system printer selected for print job");

    const dir = await mkdtemp(join(tmpdir(), "gaurav-pos-print-"));
    const file = join(dir, "ticket.txt");

    try {
      await writeFile(file, target.payload, "utf8");
      if (process.platform === "win32") {
        await this.execFileAsync("powershell.exe", [
          "-NoProfile",
          "-Command",
          `Get-Content -Raw -LiteralPath ${JSON.stringify(file)} | Out-Printer -Name ${JSON.stringify(target.printerName)}`
        ]);
      } else {
        await this.execFileAsync("lp", ["-d", target.printerName, file]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export class RoutedPrinterAdapter implements PrinterAdapter {
  constructor(
    private readonly systemAdapter = new SystemPrinterAdapter(),
    private readonly networkAdapter = new LanEscposPrinterAdapter()
  ) {}

  async print(target: PrintTarget): Promise<void> {
    if (target.printerName) {
      await this.systemAdapter.print(target);
      return;
    }

    await this.networkAdapter.print(target);
  }
}
