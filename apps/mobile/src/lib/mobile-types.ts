import type { MobileOrderStateDraftItem } from "./order-state";

export type ConnectionState = "checking" | "online" | "offline";
export type ViewMode = "tables" | "menu" | "ticket";
export type PaymentMethod = "cash" | "upi" | "card" | "online";
export type PrintMode = "kot" | "kot_print";
export type OrderStateSaveMode = "save" | "save_print";
export type MobileOrderStateItem = MobileOrderStateDraftItem;
