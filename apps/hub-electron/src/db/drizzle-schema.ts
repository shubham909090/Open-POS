import { relations } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const migrationsTable = sqliteTable("migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull()
});

export const posDays = sqliteTable("pos_days", {
  id: text("id").primaryKey(),
  outletId: text("outlet_id").notNull(),
  businessDate: text("business_date").notNull(),
  status: text("status").notNull(),
  openingCashPaise: integer("opening_cash_paise").notNull(),
  closingCashPaise: integer("closing_cash_paise"),
  openedBy: text("opened_by").notNull(),
  closedBy: text("closed_by"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at")
});

export const floors = sqliteTable("floors", {
  id: text("id").primaryKey(),
  name: text("name").notNull()
});

export const restaurantTables = sqliteTable(
  "restaurant_tables",
  {
    id: text("id").primaryKey(),
    floorId: text("floor_id").notNull().references(() => floors.id),
    name: text("name").notNull(),
    status: text("status").notNull(),
    currentOrderId: text("current_order_id"),
    occupiedAt: text("occupied_at")
  }
);

export const productionUnits = sqliteTable("production_units", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  printerHost: text("printer_host").notNull(),
  printerPort: integer("printer_port").notNull(),
  kdsEnabled: integer("kds_enabled", { mode: "boolean" }).notNull().default(true),
  printerMode: text("printer_mode").notNull().default("network"),
  printerName: text("printer_name")
});

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull(),
  productionUnitId: text("production_unit_id").notNull().references(() => productionUnits.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id").notNull().references(() => restaurantTables.id),
    posDayId: text("pos_day_id").notNull().references(() => posDays.id),
    orderType: text("order_type").notNull(),
    status: text("status").notNull(),
    pax: integer("pax").notNull(),
    captainId: text("captain_id").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_orders_table_status").on(table.tableId, table.status)]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    modifierTotalPaise: integer("modifier_total_paise").notNull().default(0),
    modifiersJson: text("modifiers_json").notNull().default("[]"),
    quantity: integer("quantity").notNull(),
    notes: text("notes").notNull().default(""),
    productionUnitId: text("production_unit_id").notNull().references(() => productionUnits.id),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_order_items_order").on(table.orderId)]
);

export const kots = sqliteTable(
  "kots",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    productionUnitId: text("production_unit_id").notNull().references(() => productionUnits.id),
    type: text("type").notNull(),
    status: text("status").notNull(),
    sequence: integer("sequence").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_kots_unit_status").on(table.productionUnitId, table.status)]
);

export const kotItems = sqliteTable("kot_items", {
  id: text("id").primaryKey(),
  kotId: text("kot_id").notNull().references(() => kots.id),
  orderItemId: text("order_item_id"),
  menuItemId: text("menu_item_id").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  modifiersJson: text("modifiers_json").notNull().default("[]"),
  notes: text("notes").notNull().default("")
});

export const modifierGroups = sqliteTable("modifier_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  selectionType: text("selection_type").notNull(),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const modifierOptions = sqliteTable(
  "modifier_options",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => modifierGroups.id),
    name: text("name").notNull(),
    priceDeltaPaise: integer("price_delta_paise").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  (table) => [index("idx_modifier_options_group").on(table.groupId)]
);

export const menuItemModifierGroups = sqliteTable(
  "menu_item_modifier_groups",
  {
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    groupId: text("group_id").notNull().references(() => modifierGroups.id),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.menuItemId, table.groupId] }), index("idx_menu_modifier_group").on(table.groupId)]
);

export const noteTemplates = sqliteTable("note_templates", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  note: text("note").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  status: text("status").notNull(),
  subtotalPaise: integer("subtotal_paise").notNull(),
  taxPaise: integer("tax_paise").notNull(),
  totalPaise: integer("total_paise").notNull(),
  discountPaise: integer("discount_paise").notNull().default(0),
  tipPaise: integer("tip_paise").notNull().default(0),
  finalTotalPaise: integer("final_total_paise").notNull().default(0),
  createdAt: text("created_at").notNull(),
  settledAt: text("settled_at")
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  method: text("method").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  receivedBy: text("received_by").notNull(),
  reference: text("reference"),
  note: text("note"),
  createdAt: text("created_at").notNull()
});

export const printJobs = sqliteTable(
  "print_jobs",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    productionUnitId: text("production_unit_id"),
    printerHost: text("printer_host"),
    printerPort: integer("printer_port"),
    printerName: text("printer_name"),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    payload: text("payload").notNull(),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_print_jobs_status").on(table.status, table.createdAt)]
);

export const eventLog = sqliteTable("event_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull()
});

export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull().unique().references(() => eventLog.eventId),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_sync_outbox_status").on(table.status, table.createdAt)]
);

export const hubSettings = sqliteTable("hub_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const localDevices = sqliteTable("local_devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
  revokedAt: text("revoked_at")
}, (table) => [uniqueIndex("idx_local_devices_hash").on(table.tokenHash)]);

export const pairingCodes = sqliteTable(
  "pairing_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    deviceName: text("device_name").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
    usedDeviceId: text("used_device_id")
  },
  (table) => [index("idx_pairing_codes_status").on(table.status, table.expiresAt)]
);

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    key: text("key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [primaryKey({ columns: [table.key, table.route] })]
);

export const floorRelations = relations(floors, ({ many }) => ({
  tables: many(restaurantTables)
}));

export const tableRelations = relations(restaurantTables, ({ one, many }) => ({
  floor: one(floors, { fields: [restaurantTables.floorId], references: [floors.id] }),
  orders: many(orders)
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  table: one(restaurantTables, { fields: [orders.tableId], references: [restaurantTables.id] }),
  items: many(orderItems),
  kots: many(kots),
  bills: many(bills)
}));

export type HubDrizzleSchema = typeof import("./drizzle-schema.js");
