import type { MenuItem } from "./catalog.js";

export interface AlcoholCatalog {
  items: Array<MenuItem & {
    type: "plain_liquor" | "prepared_product";
    large_bottle_ml: number;
    small_bottle_ml: number;
    sealed_large_count: number;
    open_large_ml: number;
    sealed_small_count: number;
    recipeIngredients: Array<{ liquor_menu_item_id: string; liquor_name: string; ml_per_unit: number }>;
  }>;
  storage: AlcoholStorageRow[];
}

export interface AlcoholStorageRow {
  id: string;
  name: string;
  active: boolean | number;
  large_bottle_ml: number;
  small_bottle_ml: number;
  sealed_large_count: number;
  open_large_ml: number;
  sealed_small_count: number;
  total_available_ml: number;
  pending_large_ml: number;
  pending_large_bottles: number;
  pending_small_bottles: number;
  pending_total_ml: number;
  expected_after_settlement_ml: number;
}

export interface AlcoholStockMovement {
  id: string;
  menu_item_id: string;
  item_name: string;
  source_type: string;
  source_id: string;
  delta_sealed_large: number;
  delta_open_large_ml: number;
  delta_sealed_small: number;
  balance_sealed_large: number;
  balance_open_large_ml: number;
  balance_sealed_small: number;
  approved_by: string | null;
  created_at: string;
}
