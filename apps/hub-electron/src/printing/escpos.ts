import net from "node:net";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parsePrintStyleLine, stripPrintStyleMarkers } from "../domain/tickets.js";

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

export function renderEscposPayload(payload: string): Buffer {
  const chunks: Buffer[] = [Buffer.from([0x1b, 0x40])];
  const lines = payload.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const parsed = parsePrintStyleLine(line);
    const text = parsed?.text ?? line;
    const alignByte = parsed?.align === "center" ? 0x01 : parsed?.align === "right" ? 0x02 : 0x00;
    const sizeByte = parsed?.size === "large" ? 0x11 : 0x00;
    chunks.push(
      Buffer.from([0x1b, 0x61, alignByte]),
      Buffer.from([0x1b, 0x45, parsed?.bold ? 0x01 : 0x00]),
      Buffer.from([0x1d, 0x21, sizeByte]),
      Buffer.from(`${text}\n`, "utf8"),
      Buffer.from([0x1b, 0x45, 0x00]),
      Buffer.from([0x1d, 0x21, 0x00])
    );
  }
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]), Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

export function buildWindowsSystemPrintCommand(file: string, printerName: string): string[] {
  return [
    "-NoProfile",
    "-Command",
    [
      "Add-Type -AssemblyName System.Drawing;",
      "Add-Type -AssemblyName System.Windows.Forms;",
      `$text = Get-Content -Raw -LiteralPath ${JSON.stringify(file)};`,
      "$lines = $text -split \"`r?`n\";",
      "if ($lines.Length -gt 0 -and $lines[$lines.Length - 1] -eq '') { if ($lines.Length -eq 1) { $lines = @() } else { $lines = $lines[0..($lines.Length - 2)] } }",
      "$marker = [char]30;",
      "$lineMarker = [char]29 + 'line:';",
      "$plainMarker = [char]31;",
      "function Parse-TicketLine($line) {",
      "  if ($line.StartsWith($lineMarker)) {",
      "    $payload = $line.Substring($lineMarker.Length);",
      "    $plainBar = $payload.IndexOf([string]$plainMarker);",
      "    $width = if ($plainBar -ge 0) { $payload.Substring(0, $plainBar) } else { $payload };",
      "    $plain = if ($plainBar -ge 0) { $payload.Substring($plainBar + 1) } else { '_' * [Math]::Max(1, [int]$width) };",
      "    return @{ Text = $plain; Size = 'normal'; Bold = $false; Align = 'left'; IsLine = $true }",
      "  }",
      "  if (-not $line.StartsWith([string]$marker)) { return @{ Text = $line; Size = 'normal'; Bold = $false; Align = 'left' } }",
      "  $bar = $line.IndexOf('|');",
      "  if ($bar -lt 0) { return @{ Text = $line; Size = 'normal'; Bold = $false; Align = 'left' } }",
      "  $parts = $line.Substring(1, $bar - 1).Split(':');",
      "  $payload = $line.Substring($bar + 1);",
      "  $plainBar = $payload.IndexOf([string]$plainMarker);",
      "  if ($plainBar -ge 0) { $payload = $payload.Substring(0, $plainBar) }",
      "  return @{ Text = $payload; Size = $parts[0]; Bold = ($parts[1] -eq '1'); Align = $parts[2] }",
      "}",
      "$doc = New-Object System.Drawing.Printing.PrintDocument;",
      `$doc.PrinterSettings.PrinterName = ${JSON.stringify(printerName)};`,
      "$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController;",
      "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0);",
      "$brush = [System.Drawing.Brushes]::Black;",
      "$script:index = 0;",
      "$doc.add_PrintPage({",
      "  param($sender, $eventArgs)",
      "  $y = 0;",
      "  while ($script:index -lt $lines.Length) {",
      "    $parsed = Parse-TicketLine $lines[$script:index];",
      "    $fontSize = if ($parsed.Size -eq 'large') { 14 } elseif ($parsed.Size -eq 'small') { 9 } else { 11 };",
      "    $fontStyle = if ($parsed.Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular };",
      "    $font = [System.Drawing.Font]::new('Consolas', $fontSize, $fontStyle);",
      "    $lineHeight = [Math]::Ceiling($font.GetHeight($eventArgs.Graphics)) + 1;",
      "    if (($y + $lineHeight) -ge $eventArgs.MarginBounds.Bottom) { break }",
      "    if ($parsed.IsLine) { $eventArgs.Graphics.DrawLine([System.Drawing.Pens]::Black, 0, $y + [Math]::Floor($lineHeight / 2), $eventArgs.MarginBounds.Width, $y + [Math]::Floor($lineHeight / 2)); $y += $lineHeight; $script:index += 1; continue }",
      "    $measure = $eventArgs.Graphics.MeasureString($parsed.Text, $font);",
      "    $x = if ($parsed.Align -eq 'center') { [Math]::Max(0, ($eventArgs.MarginBounds.Width - $measure.Width) / 2) } elseif ($parsed.Align -eq 'right') { [Math]::Max(0, $eventArgs.MarginBounds.Width - $measure.Width) } else { 0 };",
      "    $eventArgs.Graphics.DrawString($parsed.Text, $font, $brush, $x, $y);",
      "    $y += $lineHeight;",
      "    $script:index += 1;",
      "  }",
      "  $eventArgs.HasMorePages = $script:index -lt $lines.Length;",
      "});",
      "$doc.Print();"
    ].join(" ")
  ];
}

export class LanEscposPrinterAdapter implements PrinterAdapter {
  async print(target: PrintTarget): Promise<void> {
    if (!target.printerHost || !target.printerPort) {
      throw new Error("No network printer configured for print job");
    }

    const data = renderEscposPayload(target.payload);

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
      await writeFile(file, process.platform === "win32" ? target.payload : stripPrintStyleMarkers(target.payload), "utf8");
      if (process.platform === "win32") {
        await this.execFileAsync("powershell.exe", buildWindowsSystemPrintCommand(file, target.printerName));
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
