import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { hubApi, type AlcoholCatalog, type ProductionUnit } from "../../hub-api.js";
import { type NoticeSetter, messageOf, rupeesToPaise, paiseToRupeeInput } from "../../lib/format.js";

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlcoholEditForm({
  item,
  plainLiquors,
  units,
  onCancel,
  onSaved,
  setNotice,
}: {
  item: AlcoholItem;
  plainLiquors: AlcoholItem[];
  units: ProductionUnit[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [type, setType] = useState<"plain_liquor" | "prepared_product">(
    item.type,
  );
  const [name, setName] = useState(item.name);
  const [unitId, setUnitId] = useState(item.production_unit_id ?? "");
  const [active, setActive] = useState(Boolean(item.active));
  const [largeMl, setLargeMl] = useState(
    String(item.large_bottle_ml || 750),
  );
  const [smallMl, setSmallMl] = useState(
    String(item.small_bottle_ml || 180),
  );
  const [variants, setVariants] = useState<EditableAlcoholVariant[]>(() =>
    buildEditableAlcoholVariants(item),
  );
  const [recipe, setRecipe] = useState(() =>
    item.recipeIngredients.map((entry) => ({
      liquorMenuItemId: entry.liquor_menu_item_id,
      mlPerUnit: String(entry.ml_per_unit),
    })),
  );
  const availableLiquors = plainLiquors.filter(
    (liquor) => liquor.id !== item.id,
  );

  const save = useMutation({
    mutationFn: () => {
      const normalizedVariants =
        type === "plain_liquor"
          ? variants
              .filter((variant) => rupeesToPaise(variant.price) > 0)
              .map((variant) => ({
                id: variant.id,
                label:
                  variant.label ||
                  variantLabelForKind(
                    variant.kind,
                    Number(smallMl || 180),
                    Number(largeMl || 750),
                  ),
                kind: variant.kind,
                pricePaise: rupeesToPaise(variant.price),
                volumeMl: Number(variant.volumeMl || 0) || null,
                inventoryAction: variant.inventoryAction,
                sortOrder: variant.sortOrder,
                active: variant.active,
              }))
          : [
              {
                id: item.variants?.find((variant) => variant.kind === "default")
                  ?.id,
                label: "Regular",
                kind: "default" as const,
                pricePaise: rupeesToPaise(variants[0]?.price ?? ""),
                volumeMl: null,
                inventoryAction: "none" as const,
                sortOrder: 0,
                active: true,
              },
            ];
      return hubApi.updateAlcoholItem(item.id, {
        type,
        name,
        productionUnitId: unitId || null,
        active,
        largeBottleMl: Number(largeMl || 750),
        smallBottleMl: Number(smallMl || 180),
        variants: normalizedVariants,
        recipeIngredients:
          type === "prepared_product"
            ? recipe
                .filter(
                  (row) => row.liquorMenuItemId && Number(row.mlPerUnit) > 0,
                )
                .map((row) => ({
                  liquorMenuItemId: row.liquorMenuItemId,
                  mlPerUnit: Number(row.mlPerUnit),
                }))
            : [],
      });
    },
    onSuccess: async () => {
      await onSaved();
      setNotice({ tone: "good", text: "Alcohol item updated." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const hasActivePricedVariant =
    type === "plain_liquor"
      ? variants.some(
          (variant) => variant.active && rupeesToPaise(variant.price) > 0,
        )
      : rupeesToPaise(variants[0]?.price ?? "") > 0;
  const canSave = name.trim() && (!active || hasActivePricedVariant);

  return (
    <form
      className="alcohol-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="three-col">
        <label>
          Type
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as
                | "plain_liquor"
                | "prepared_product";
              setType(nextType);
              setVariants(
                nextType === "plain_liquor"
                  ? editablePlainVariantDefaults(
                      Number(smallMl || 180),
                      Number(largeMl || 750),
                    )
                  : [
                      {
                        ...defaultPreparedVariant(),
                        price:
                          variants.find((variant) => variant.active)?.price ??
                          variants[0]?.price ??
                          "",
                      },
                    ],
              );
            }}
          >
            <option value="plain_liquor">Plain liquor</option>
            <option value="prepared_product">
              Prepared alcohol product
            </option>
          </select>
        </label>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Bar counter
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
          >
            <option value="">Alcohol group default</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Active in menu
      </label>
      {type === "plain_liquor" ? (
        <>
          <div className="three-col">
            <label>
              Large ml
              <input
                value={largeMl}
                onChange={(event) => setLargeMl(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              Small ml
              <input
                value={smallMl}
                onChange={(event) => setSmallMl(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <span />
          </div>
          <div className="variant-edit-list">
            {variants.map((variant, index) => (
              <div className="variant-edit-row" key={variant.kind}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={(event) =>
                      setVariants((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, active: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  Sell
                </label>
                <input
                  value={variant.label}
                  onChange={(event) =>
                    setVariants((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, label: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  placeholder="Label"
                />
                <input
                  value={variant.volumeMl}
                  onChange={(event) =>
                    setVariants((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, volumeMl: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder="ml"
                />
                <input
                  value={variant.price}
                  onChange={(event) =>
                    setVariants((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, price: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  inputMode="decimal"
                  placeholder="Price"
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <label>
            Price
            <input
              value={variants[0]?.price ?? ""}
              onChange={(event) =>
                setVariants((current) => [
                  {
                    ...(current[0] ?? defaultPreparedVariant()),
                    price: event.target.value,
                  },
                ])
              }
              inputMode="decimal"
            />
          </label>
          <div className="recipe-list">
            {recipe.map((row, index) => (
              <div className="recipe-row" key={index}>
                <select
                  value={row.liquorMenuItemId}
                  onChange={(event) =>
                    setRecipe((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? {
                              ...entry,
                              liquorMenuItemId: event.target.value,
                            }
                          : entry,
                      ),
                    )
                  }
                >
                  <option value="">Choose liquor</option>
                  {availableLiquors.map((liquor) => (
                    <option key={liquor.id} value={liquor.id}>
                      {liquor.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.mlPerUnit}
                  onChange={(event) =>
                    setRecipe((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, mlPerUnit: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder="ml"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRecipe((current) =>
                      current.filter(
                        (_, entryIndex) => entryIndex !== index,
                      ),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary-inline"
              onClick={() =>
                setRecipe((current) => [
                  ...current,
                  {
                    liquorMenuItemId: availableLiquors[0]?.id ?? "",
                    mlPerUnit: "30",
                  },
                ])
              }
            >
              <Plus size={14} />
              Add liquor
            </button>
          </div>
        </>
      )}
      <div className="form-actions">
        <button type="submit" disabled={!canSave || save.isPending}>
          <Save size={14} />
          Save
        </button>
        <button type="button" className="secondary-inline" onClick={onCancel}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
