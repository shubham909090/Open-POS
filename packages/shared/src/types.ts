export type UserRole = "admin" | "captain" | "waiter" | "kitchen";
export type PosDayStatus = "active" | "finalized";
export type TableStatus = "free" | "occupied" | "billed" | "attention";
export type TableDisplayState = "free" | "running" | "bill_printed" | "needs_attention" | "disabled";
export type OrderType = "dine_in" | "takeaway";
export type OrderStatus = "open" | "billed" | "paid" | "cancelled";
export type KotType = "new" | "modified" | "partial_cancel" | "cancelled" | "reprint";
export type KotStatus = "queued" | "preparing" | "ready" | "served" | "cancelled";
export type BillStatus = "pending" | "paid" | "void" | "revised";
export type PaymentMethod = "cash" | "upi" | "card" | "online";
export type PrintJobStatus = "pending" | "printing" | "printed" | "failed";
export type SyncStatus = "pending" | "synced" | "failed";
export type LocalDeviceStatus = "active" | "revoked";
export type SaleGroupKind = "food" | "alcohol" | "beverage" | "other";
export type TicketLabel = "KOT" | "BOT";

export interface TaxComponent {
  name: string;
  rateBps: number;
}

export interface SaleGroup {
  id: string;
  name: string;
  kind: SaleGroupKind;
  reportLabel: string;
  ticketLabel: TicketLabel;
  taxComponents: TaxComponent[];
  defaultProductionUnitId: string | null;
  active: boolean;
}

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
  productionUnitId: string | null;
  saleGroupId: string;
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
  menuItemId?: string;
  menuItemVariantId?: string;
  quantity: number;
  openName?: string;
  openPricePaise?: number;
  saleGroupId?: string;
  productionUnitId?: string | null;
  unitPricePaise?: number;
}

export interface DomainEvent {
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  createdAt: string;
}
