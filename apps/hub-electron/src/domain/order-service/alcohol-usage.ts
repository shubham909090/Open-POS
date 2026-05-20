import type { AlcoholRecipeSnapshotIngredient, OrderItemRow } from "./types.js";

export type AlcoholUsage = Map<string, { largeMl: number; largeBottles: number; smallBottles: number }>;

export function calculateAlcoholUsageForItems(items: OrderItemRow[]): AlcoholUsage {
  const usage: AlcoholUsage = new Map();
  const add = (menuItemId: string, delta: Partial<{ largeMl: number; largeBottles: number; smallBottles: number }>) => {
    const current = usage.get(menuItemId) ?? { largeMl: 0, largeBottles: 0, smallBottles: 0 };
    usage.set(menuItemId, {
      largeMl: current.largeMl + (delta.largeMl ?? 0),
      largeBottles: current.largeBottles + (delta.largeBottles ?? 0),
      smallBottles: current.smallBottles + (delta.smallBottles ?? 0)
    });
  };

  for (const item of items) {
    if (!item.menu_item_id) continue;
    if (item.inventory_action_snapshot === "large_ml") {
      add(item.menu_item_id, { largeMl: (item.variant_volume_ml ?? 0) * item.quantity });
    } else if (item.inventory_action_snapshot === "small_bottle") {
      add(item.menu_item_id, { smallBottles: item.quantity });
    } else if (item.inventory_action_snapshot === "large_bottle") {
      add(item.menu_item_id, { largeBottles: item.quantity });
    }

    for (const recipe of parseAlcoholRecipeSnapshot(item.alcohol_recipe_snapshot_json)) {
      add(recipe.liquorMenuItemId, { largeMl: recipe.mlPerUnit * item.quantity });
    }
  }

  return usage;
}

export function parseAlcoholRecipeSnapshot(snapshotJson: string): AlcoholRecipeSnapshotIngredient[] {
  try {
    const parsed = JSON.parse(snapshotJson || "[]") as AlcoholRecipeSnapshotIngredient[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry.liquorMenuItemId === "string" && Number.isFinite(entry.mlPerUnit) && entry.mlPerUnit > 0);
  } catch {
    return [];
  }
}
