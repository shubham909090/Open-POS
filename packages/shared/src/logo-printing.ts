export const LOGO_PRINT_DEFAULTS = {
  widthMm: 32,
  widePaperWidthMm: 40,
  minWidthMm: 12,
  maxWidthMm: 72,
  maxHeightMm: 80,
  dotsPerInch: 203,
  threshold: 160,
  whitePaddingThreshold: 250,
  printMode: "threshold" as const
};

export const RESTAURANT_LOGO_NORMALIZATION = {
  maxInputPixels: 16_000_000,
  iconSize: 512,
  dimensions: [1600, 1200, 900, 675] as const
};

export type LogoPrintSettings = {
  logoWidthMm?: number | null;
  logoThreshold?: number;
  logoPrintMode?: "threshold" | "dither";
};

export type LogoPixels = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

export function printPaperDotsForChars(chars: number): number {
  return chars <= 25 ? 320 : chars <= 28 ? 360 : chars <= 32 ? 384 : chars <= 48 ? 576 : 832;
}

export function logoPrintWidthMm(paperDots: number, widthMm?: number | null): number {
  const requested = widthMm ?? (paperDots >= 576 ? LOGO_PRINT_DEFAULTS.widePaperWidthMm : LOGO_PRINT_DEFAULTS.widthMm);
  const bounded = Math.max(LOGO_PRINT_DEFAULTS.minWidthMm, Math.min(LOGO_PRINT_DEFAULTS.maxWidthMm, requested));
  return Math.min(bounded, (paperDots - 16) * 25.4 / LOGO_PRINT_DEFAULTS.dotsPerInch);
}

/** Shared by the receipt preview and printer, including monochrome conversion. */
export function renderLogoBitmap(source: LogoPixels, paperDots: number, settings: LogoPrintSettings = {}): LogoPixels {
  const threshold = Math.max(0, Math.min(255, settings.logoThreshold ?? LOGO_PRINT_DEFAULTS.threshold));
  const paddingThreshold = Math.max(LOGO_PRINT_DEFAULTS.whitePaddingThreshold, threshold);
  const grey = new Float64Array(source.width * source.height);
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3]! / 255;
      const value = (source.data[offset]! * 0.299 + source.data[offset + 1]! * 0.587 + source.data[offset + 2]! * 0.114) * alpha + 255 * (1 - alpha);
      grey[y * source.width + x] = value;
      if (value < paddingThreshold) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) return { width: paperDots, height: 1, data: new Uint8Array(paperDots * 4).fill(255) };

  const sourceWidth = right - left + 1;
  const sourceHeight = bottom - top + 1;
  const dotsPerMm = LOGO_PRINT_DEFAULTS.dotsPerInch / 25.4;
  const desiredWidth = logoPrintWidthMm(paperDots, settings.logoWidthMm) * dotsPerMm;
  const scale = Math.min(desiredWidth / sourceWidth, LOGO_PRINT_DEFAULTS.maxHeightMm * dotsPerMm / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  // Area averaging retains thin strokes when reducing an image. Bilinear
  // interpolation avoids jagged edges when enlarging a small source.
  const horizontal = new Float64Array(width * sourceHeight);
  for (let y = 0; y < sourceHeight; y++) {
    resampleLine(sourceWidth, width, x => grey[(y + top) * source.width + x + left]!, (x, value) => { horizontal[y * width + x] = value; });
  }
  const resized = new Float64Array(width * height);
  for (let x = 0; x < width; x++) {
    resampleLine(sourceHeight, height, y => horizontal[y * width + x]!, (y, value) => { resized[y * width + x] = value; });
  }

  const dither = settings.logoPrintMode === "dither";
  const data = new Uint8Array(paperDots * height * 4).fill(255);
  const startX = Math.floor((paperDots - width) / 2);
  const errors = new Float64Array(width * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const greyValue = resized[index]!;
      const value = dither ? Math.min(255, greyValue * 128 / Math.max(1, threshold)) + errors[index]! : greyValue;
      const black = threshold > 0 && (dither ? value < 128 : value < threshold);
      const output = black ? 0 : 255;
      const offset = (y * paperDots + startX + x) * 4;
      data[offset] = output;
      data[offset + 1] = output;
      data[offset + 2] = output;
      if (dither) {
        const error = value - output;
        if (x + 1 < width) errors[index + 1]! += error * 7 / 16;
        if (x > 0) errors[index + width - 1]! += error * 3 / 16;
        errors[index + width]! += error * 5 / 16;
        if (x + 1 < width) errors[index + width + 1]! += error / 16;
      }
    }
  }
  return { width: paperDots, height, data };
}

function resampleLine(sourceSize: number, targetSize: number, read: (index: number) => number, write: (index: number, value: number) => void): void {
  const ratio = sourceSize / targetSize;
  for (let target = 0; target < targetSize; target++) {
    if (ratio < 1) {
      const position = Math.max(0, Math.min(sourceSize - 1, (target + 0.5) * ratio - 0.5));
      const lower = Math.floor(position);
      const blend = position - lower;
      write(target, read(lower) * (1 - blend) + read(Math.min(sourceSize - 1, lower + 1)) * blend);
      continue;
    }
    const start = target * ratio;
    const end = (target + 1) * ratio;
    let total = 0;
    for (let source = Math.floor(start); source < Math.ceil(end); source++) {
      const weight = Math.min(end, source + 1) - Math.max(start, source);
      total += read(Math.min(sourceSize - 1, source)) * weight;
    }
    write(target, total / ratio);
  }
}
