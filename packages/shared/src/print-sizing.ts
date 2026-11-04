export type LegacyPrintTextSize = "small" | "normal" | "large";

/** Positions preserve the original three sizes while exposing intermediate steps. */
export function printSizeLevel(size: LegacyPrintTextSize, level?: number): number {
  if (level !== undefined && Number.isFinite(level)) return Math.max(0, Math.min(10, Math.round(level)));
  return size === "small" ? 0 : size === "large" ? 10 : 2;
}

export function printSizeScale(level: number): number {
  return 0.75 + printSizeLevel("normal", level) * 0.125;
}

export function printFontPoints(size: LegacyPrintTextSize, level?: number): number {
  if (level === undefined) return size === "small" ? 9 : size === "large" ? 14 : 11;
  const value = printSizeLevel(size, level);
  return value <= 2 ? 9 + value : 11 + (value - 2) * 0.375;
}

/** Physical bill-printer overrides leave existing shared receipt widths intact. */
export function billPrinterLineWidthChars(paperWidthMm: number | null | undefined, legacyLineWidthChars: number): number {
  if (paperWidthMm === 45) return 25;
  if (paperWidthMm === 50) return 28;
  if (paperWidthMm === 58) return 32;
  if (paperWidthMm === 80) return legacyLineWidthChars === 48 ? 48 : 42;
  return legacyLineWidthChars;
}
