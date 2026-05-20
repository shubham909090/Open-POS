export interface PosDay {
  id: string;
  business_date: string;
  period_start_at: string;
  period_end_at: string;
  status: string;
}

export interface Floor {
  id: string;
  name: string;
  active: boolean;
  sort_order?: number;
}

export interface Table {
  id: string;
  floor_id: string;
  floor_name: string;
  name: string;
  active: boolean;
  sort_order?: number;
  status: "free" | "occupied" | "billed" | string;
  current_order_id: string | null;
  occupied_at: string | null;
  timer_ended_at?: string | null;
  current_order_total_paise: number;
  sent_item_count: number;
}

export interface ProductionUnit {
  id: string;
  name: string;
  printer_mode?: "system" | "network";
  printer_name?: string | null;
  printer_host?: string;
  printer_port?: number;
  kds_enabled?: boolean | number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  price_paise: number;
  production_unit_id: string | null;
  production_unit_name: string | null;
  sale_group_id: string;
  sale_group_name: string;
  sale_group_kind: string;
  ticket_label: "KOT" | "BOT";
  active: boolean;
  variants?: MenuItemVariant[];
}

export interface MenuItemVariant {
  id: string;
  menu_item_id: string;
  label: string;
  kind: "default" | "shot" | "small_bottle" | "large_bottle" | string;
  price_paise: number;
  volume_ml: number | null;
  inventory_action: "none" | "large_ml" | "small_bottle" | "large_bottle" | string;
  sort_order: number;
  active: boolean | number;
}

export interface SaleGroup {
  id: string;
  name: string;
  kind: "food" | "alcohol" | "beverage" | "other";
  report_label: string;
  ticket_label: "KOT" | "BOT";
  tax_components_json: string;
  default_production_unit_id: string | null;
  default_production_unit_name?: string | null;
  active: boolean;
}

export interface CsvImportResult {
  created: number;
  failed: number;
  ids: string[];
  errors: Array<{ row: number; message: string }>;
}

export interface BulkDeleteResult {
  deleted: number;
  disabled: number;
  failed: number;
  errors: Array<{ id: string; name?: string; message: string }>;
}
