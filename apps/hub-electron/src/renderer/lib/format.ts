import type { AlcoholStockMovement, MenuItem } from "../hub-api.js";

export type NoticeSetter = (notice: { tone: "good" | "bad"; text: string }) => void;

export type MenuItemVariantOption = {
  id?: string;
  label: string;
  kind: string;
  price_paise: number;
};

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function rupeesToPaise(value: string) {
  return Math.round(Number(value || 0) * 100);
}

export function paiseToRupeeInput(value: number) {
  const rupees = value / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function menuItemVariantOptions(item?: MenuItem): MenuItemVariantOption[] {
  if (!item) return [];
  const variants = (item.variants ?? []).filter((variant) => Boolean(variant.active));
  if (variants.length > 0) return variants.map((variant) => ({ id: variant.id, label: variant.label, kind: variant.kind, price_paise: variant.price_paise }));
  if (item.sale_group_kind === "alcohol") return [];
  return [{ label: "Regular", kind: "default", price_paise: item.price_paise }];
}

export function alcoholMovementSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    bill_settlement: "Bill settlement",
    manual_adjustment: "Manual edit",
    negative_stock: "Negative stock",
  };
  return labels[sourceType] ?? sourceType.replaceAll("_", " ");
}

export function alcoholMovementDeltaText(movement: AlcoholStockMovement) {
  const parts = [
    signedStockPart(movement.delta_sealed_large, "large"),
    signedStockPart(movement.delta_open_large_ml, "ml"),
    signedStockPart(movement.delta_sealed_small, "small"),
  ].filter(Boolean);
  return parts.length ? parts.join(" \u00B7 ") : "No stock change";
}

export function signedStockPart(value: number, unit: string) {
  if (!value) return "";
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}
