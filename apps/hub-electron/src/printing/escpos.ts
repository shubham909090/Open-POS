import net from "node:net";
import { PNG } from "pngjs";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { bitmapEscpos, logoBitmap, qrBitmap, renderTicketPdf, textBitmap, ticketPaperDots } from "./ticket-raster.js";
import { parsePrintStyleLine, PRINT_PAPER_MARKER, stripPrintStyleMarkers } from "../domain/tickets.js";

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
  const paperDots = ticketPaperDots(payload);
  const lines = payload.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const parsed = parsePrintStyleLine(line);
    if (parsed?.paperWidthChars) continue;
    if (parsed?.logoImageDataUrl) { chunks.push(bitmapEscpos(logoBitmap(parsed, paperDots))); continue; }
    if (parsed?.qrImageDataUrl) { chunks.push(bitmapEscpos(qrBitmap(parsed, paperDots))); continue; }
    if (parsed?.sizeLevel !== undefined) { chunks.push(bitmapEscpos(textBitmap(parsed, paperDots))); continue; }
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

const WINDOWS_LOGO_RASTER_MARKER = "\u001dlogo-raster:";

export function prepareWindowsSystemPrintPayload(payload: string): string {
  const paperDots = ticketPaperDots(payload);
  return payload.split(/\r?\n/).map(line => {
    const parsed = parsePrintStyleLine(line);
    if (!parsed?.logoImageDataUrl) return line;
    const bitmap = logoBitmap(parsed, paperDots);
    const png = new PNG({ width: bitmap.width, height: bitmap.height });
    png.data = Buffer.from(bitmap.data);
    return `${WINDOWS_LOGO_RASTER_MARKER}${PNG.sync.write(png).toString("base64")}`;
  }).join("\n");
}

export function buildWindowsSystemPrintCommand(file: string, printerName: string): string[] {
  return [
    "-NoProfile",
    "-Command",
    [
      "Add-Type -AssemblyName System.Drawing;",
      "Add-Type -AssemblyName System.Windows.Forms;",
      `$text = Get-Content -Raw -Encoding UTF8 -LiteralPath ${JSON.stringify(file)};`,
      "$lines = $text -split \"`r?`n\";",
      "if ($lines.Length -gt 0 -and $lines[$lines.Length - 1] -eq '') { if ($lines.Length -eq 1) { $lines = @() } else { $lines = $lines[0..($lines.Length - 2)] } }",
      "$marker = [char]30;",
      "$lineMarker = [char]29 + 'line:';",
      "$plainMarker = [char]31;",
      "$logoMarker = [char]29 + 'logo-raster:';",
      "$qrMarker = [char]29 + 'qr:';",
      "$paperMarker = [char]29 + 'paper:';",
      "function Parse-TicketLine($line) {",
      "  if ($line.StartsWith($paperMarker)) { return @{ IsPaper = $true; WidthChars = [int]$line.Substring($paperMarker.Length) } }",
      "  if ($line.StartsWith($logoMarker)) { return @{ LogoBase64 = $line.Substring($logoMarker.Length) } }",
      "  if ($line.StartsWith($qrMarker)) { $qr = $line.Substring($qrMarker.Length); $qrBar = $qr.IndexOf(':data:'); $mm = if ($qrBar -ge 0) { [double]$qr.Substring(0, $qrBar) } else { 32 }; $png = if ($qrBar -ge 0) { $qr.Substring($qrBar + 1) } else { $qr }; return @{ QrBase64 = $png.Substring($png.IndexOf(',') + 1); QrSizeMm = [Math]::Max(20, [Math]::Min(45, $mm)) } }",
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
      "  return @{ Text = $payload; Size = $parts[0]; Bold = ($parts[1] -eq '1'); Align = $parts[2]; Level = if ($parts.Length -gt 3) { $parts[3] } else { $null } }",
      "}",
      "$doc = New-Object System.Drawing.Printing.PrintDocument;",
      `$doc.PrinterSettings.PrinterName = ${JSON.stringify(printerName)};`,
      "$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController;",
      "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0);",
      "$brush = [System.Drawing.Brushes]::Black;",
      "$script:index = 0; $script:paperWidth = $null;",
      "$doc.add_PrintPage({",
      "  param($sender, $eventArgs)",
      "  $y = 0;",
      "  while ($script:index -lt $lines.Length) {",
      "    $parsed = Parse-TicketLine $lines[$script:index];",
      "    if ($parsed.IsPaper) { $dots = if ($parsed.WidthChars -le 25) { 320 } elseif ($parsed.WidthChars -le 28) { 360 } elseif ($parsed.WidthChars -le 32) { 384 } elseif ($parsed.WidthChars -le 48) { 576 } else { 832 }; $script:paperWidth = $dots * 100 / 203; $script:index += 1; continue }",
      "    $contentWidth = if ($null -ne $script:paperWidth) { [Math]::Min($eventArgs.MarginBounds.Width, $script:paperWidth) } else { $eventArgs.MarginBounds.Width };",
      "    if ($parsed.LogoBase64) {",
      "      $stream = [System.IO.MemoryStream]::new([Convert]::FromBase64String($parsed.LogoBase64)); $image = [System.Drawing.Image]::FromStream($stream);",
      "      $width = [Math]::Min($contentWidth, $image.Width * 100 / 203); $height = $image.Height * $width / $image.Width;",
      "      if (($y + $height) -ge $eventArgs.MarginBounds.Bottom -and $y -gt 0) { $image.Dispose(); $stream.Dispose(); break }",
      "      $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor; $eventArgs.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half; $eventArgs.Graphics.DrawImage($image, [single](($contentWidth - $width) / 2), [single]$y, [single]$width, [single]$height);",
      "      $image.Dispose(); $stream.Dispose(); $y += $height; $script:index += 1; continue;",
      "    }",
      "    if ($parsed.QrBase64) {",
      "      $stream = [System.IO.MemoryStream]::new([Convert]::FromBase64String($parsed.QrBase64));",
      "      $image = [System.Drawing.Image]::FromStream($stream);",
      "      $modules = $image.Width / 8; $dpi = $eventArgs.Graphics.DpiX;",
      "      $availableDots = [Math]::Floor(($contentWidth - 8) * $dpi / 100);",
      "      $minimumDots = [Math]::Ceiling($dpi * 0.25 / 25.4);",
      "      if ($modules * $minimumDots -gt $availableDots) { $image.Dispose(); $stream.Dispose(); throw 'Payment QR is too detailed for this paper width.' }",
      "      $moduleDots = [Math]::Min([Math]::Floor($availableDots / $modules), [Math]::Max($minimumDots, [Math]::Floor($parsed.QrSizeMm * $dpi / 25.4 / $modules)));",
      "      $side = $modules * $moduleDots * 100 / $dpi;",
      "      if (($y + $side) -ge $eventArgs.MarginBounds.Bottom -and $y -gt 0) { $image.Dispose(); $stream.Dispose(); break }",
      "      $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor;",
      "      $eventArgs.Graphics.DrawImage($image, [single](($contentWidth - $side) / 2), [single]$y, [single]$side, [single]$side);",
      "      $image.Dispose(); $stream.Dispose(); $y += $side; $script:index += 1; continue;",
      "    }",
      "    $fontSize = if ($parsed.Size -eq 'large') { 14 } elseif ($parsed.Size -eq 'small') { 9 } else { 11 };",
      "    if ($null -ne $parsed.Level -and $parsed.Level -match '^([0-9]|10)$') { $level = [int]$parsed.Level; $fontSize = if ($level -le 2) { 9 + $level } else { 11 + ($level - 2) * 0.375 } }",
      "    $fontStyle = if ($parsed.Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular };",
      "    $font = [System.Drawing.Font]::new('Consolas', $fontSize, $fontStyle);",
      "    $lineHeight = [Math]::Ceiling($font.GetHeight($eventArgs.Graphics)) + 1;",
      "    if (($y + $lineHeight) -ge $eventArgs.MarginBounds.Bottom) { break }",
      "    if ($parsed.IsLine) { $eventArgs.Graphics.DrawLine([System.Drawing.Pens]::Black, 0, $y + [Math]::Floor($lineHeight / 2), $contentWidth, $y + [Math]::Floor($lineHeight / 2)); $y += $lineHeight; $script:index += 1; continue }",
      "    $measure = $eventArgs.Graphics.MeasureString($parsed.Text, $font);",
      "    $x = if ($parsed.Align -eq 'center') { [Math]::Max(0, ($contentWidth - $measure.Width) / 2) } elseif ($parsed.Align -eq 'right') { [Math]::Max(0, $eventArgs.MarginBounds.Width - $measure.Width) } else { 0 };",
      "    if ($null -eq $parsed.Level) { $eventArgs.Graphics.DrawString($parsed.Text, $font, $brush, $x, $y); $font.Dispose(); $y += $lineHeight; $script:index += 1; continue }",
      "    $wrappedHeight = [Math]::Max($lineHeight, $eventArgs.Graphics.MeasureString($parsed.Text, $font, [int]$contentWidth).Height);",
      "    if (($y + $wrappedHeight) -ge $eventArgs.MarginBounds.Bottom -and $y -gt 0) { $font.Dispose(); break }",
      "    $x = if ($parsed.Align -eq 'center') { [Math]::Max(0, ($contentWidth - $measure.Width) / 2) } elseif ($parsed.Align -eq 'right') { [Math]::Max(0, $contentWidth - $measure.Width) } else { 0 };",
      "    $rect = [System.Drawing.RectangleF]::new([single]$x, [single]$y, [single]([Math]::Max(1, $contentWidth - $x)), [single]($wrappedHeight + $lineHeight));",
      "    $eventArgs.Graphics.DrawString($parsed.Text, $font, $brush, $rect);",
      "    $font.Dispose(); $y += [Math]::Ceiling($wrappedHeight);",
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
      await writeFile(file, process.platform === "win32" ? prepareWindowsSystemPrintPayload(target.payload) : stripPrintStyleMarkers(target.payload), "utf8");
      if (process.platform === "win32") {
        await this.execFileAsync("powershell.exe", buildWindowsSystemPrintCommand(file, target.printerName));
      } else {
        if (target.payload.includes(PRINT_PAPER_MARKER)) {
          const pdf = renderTicketPdf(target.payload);
          const pdfFile = join(dir, "ticket.pdf");
          await writeFile(pdfFile, pdf.data);
          await this.execFileAsync("lp", ["-d", target.printerName, "-o", `media=Custom.${pdf.widthMm.toFixed(2)}x${pdf.heightMm.toFixed(2)}mm`, "-o", "fit-to-page", pdfFile]);
        } else {
          await this.execFileAsync("lp", ["-d", target.printerName, file]);
        }
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
