export type UserRole = "admin" | "cashier" | "waiter" | "kitchen";
export type PosDayStatus = "open" | "closed";
export type TableStatus = "free" | "occupied" | "attention";
export type OrderType = "dine_in" | "takeaway";
export type OrderStatus = "open" | "billed" | "paid" | "cancelled";
export type KotType = "new" | "modified" | "partial_cancel" | "cancelled" | "reprint";
export type KotStatus = "queued" | "preparing" | "ready" | "served" | "cancelled";
export type BillStatus = "pending" | "paid" | "void";
export type PaymentMethod = "cash" | "upi" | "card";
export type PrintJobStatus = "pending" | "printing" | "printed" | "failed";
export type SyncStatus = "pending" | "synced" | "failed";

export interface ProductionUnit {
  id: string;
  name: string;
  printerHost: string;
  printerPort: number;
  kdsEnabled: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  pricePaise: number;
  productionUnitId: string;
  active: boolean;
}

export interface RestaurantTable {
  id: string;
  name: string;
  floorId: string;
  status: TableStatus;
  currentOrderId: string | null;
}

export interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface DomainEvent {
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  createdAt: string;
}
