import type { AlcoholCatalog } from "../../hub-api.js";
import { paiseToRupeeInput } from "../../lib/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlcoholItem = AlcoholCatalog["items"][number];
export type AlcoholVariantKind = "default" | "shot" | "small_bottle" | "large_bottle";
export type AlcoholInventoryAction = "none" | "large_ml" | "small_bottle" | "large_bottle";

export type EditableAlcoholVariant = {
  id?: string;
  label: string;
  kind: AlcoholVariantKind;
  price: string;
  volumeMl: string;
  inventoryAction: AlcoholInventoryAction;
  sortOrder: number;
  active: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildEditableAlcoholVariants(
  item: AlcoholItem,
): EditableAlcoholVariant[] {
  if (item.type === "prepared_product") {
    const variant =
      item.variants?.find((entry) => entry.kind === "default") ??
      item.variants?.[0];
    return [
      {
        ...defaultPreparedVariant(),
        id: variant?.id,
        price: variant ? paiseToRupeeInput(variant.price_paise) : "",
      },
    ];
  }
  const byKind = new Map(
    (item.variants ?? []).map((variant) => [variant.kind, variant]),
  );
  const defaults = editablePlainVariantDefaults(
    item.small_bottle_ml || 180,
    item.large_bottle_ml || 750,
  );
  return defaults.map((fallback) => {
    const existing = byKind.get(fallback.kind);
    return {
      ...fallback,
      id: existing?.id,
      label: existing?.label ?? fallback.label,
      price: existing ? paiseToRupeeInput(existing.price_paise) : "",
      volumeMl: existing?.volume_ml
        ? String(existing.volume_ml)
        : fallback.volumeMl,
      inventoryAction:
        normalizeInventoryAction(existing?.inventory_action) ??
        fallback.inventoryAction,
      sortOrder: existing?.sort_order ?? fallback.sortOrder,
      active: existing ? Boolean(existing.active) : false,
    };
  });
}

export function editablePlainVariantDefaults(
  smallMl: number,
  largeMl: number,
): EditableAlcoholVariant[] {
  return [
    {
      label: "30 ml",
      kind: "shot",
      price: "",
      volumeMl: "30",
      inventoryAction: "large_ml",
      sortOrder: 0,
      active: false,
    },
    {
      label: `${smallMl} ml`,
      kind: "small_bottle",
      price: "",
      volumeMl: String(smallMl),
      inventoryAction: "small_bottle",
      sortOrder: 1,
      active: false,
    },
    {
      label: `${largeMl} ml`,
      kind: "large_bottle",
      price: "",
      volumeMl: String(largeMl),
      inventoryAction: "large_bottle",
      sortOrder: 2,
      active: false,
    },
  ];
}

export function defaultPreparedVariant(): EditableAlcoholVariant {
  return {
    label: "Regular",
    kind: "default",
    price: "",
    volumeMl: "",
    inventoryAction: "none",
    sortOrder: 0,
    active: true,
  };
}

export function variantLabelForKind(
  kind: AlcoholVariantKind,
  smallMl: number,
  largeMl: number,
) {
  if (kind === "shot") return "30 ml";
  if (kind === "small_bottle") return `${smallMl} ml`;
  if (kind === "large_bottle") return `${largeMl} ml`;
  return "Regular";
}

export function normalizeInventoryAction(
  value?: string,
): AlcoholInventoryAction | null {
  return value === "large_ml" ||
    value === "small_bottle" ||
    value === "large_bottle" ||
    value === "none"
    ? value
    : null;
}
