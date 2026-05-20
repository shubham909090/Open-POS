import type { TaxComponentAmount } from "@gaurav-pos/shared";
import { DEFAULT_TAX_COMPONENTS } from "./types.js";

export function parseTaxComponents(value: string | null | undefined): Array<{ name: string; rateBps: number }> {
  if (!value) return DEFAULT_TAX_COMPONENTS;
  try {
    const parsed = JSON.parse(value) as Array<{ name?: unknown; rateBps?: unknown }>;
    if (!Array.isArray(parsed)) return DEFAULT_TAX_COMPONENTS;
    if (parsed.length === 0) return [];
    return parsed
      .map((component) => ({ name: String(component.name ?? "Tax"), rateBps: Number(component.rateBps ?? 0) }))
      .filter((component) => component.name && !isVatComponent(component.name) && Number.isFinite(component.rateBps));
  } catch {
    return DEFAULT_TAX_COMPONENTS;
  }
}

export function parseTaxBreakdown(value: string | null | undefined): TaxComponentAmount[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as TaxComponentAmount[];
    return Array.isArray(parsed) ? parsed.filter((component) => !isVatComponent(component.name)) : [];
  } catch {
    return [];
  }
}

function isVatComponent(name: string): boolean {
  return /\bvat\b/i.test(name);
}
