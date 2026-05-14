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
  periodStartAt: text("period_start_at").notNull(),
  periodEndAt: text("period_end_at").notNull(),
  createdAt: text("created_at").notNull(),
  finalizedAt: text("finalized_at")
});

export const dailyReportSnapshots = sqliteTable(
  "daily_report_snapshots",
  {
    posDayId: text("pos_day_id").primaryKey().references(() => posDays.id),
    businessDate: text("business_date").notNull(),
    status: text("status").notNull(),
    billCount: integer("bill_count").notNull(),
    openOrders: integer("open_orders").notNull(),
    billedOrders: integer("billed_orders").notNull(),
    paidBills: integer("paid_bills").notNull(),
    unpaidBills: integer("unpaid_bills").notNull(),
    cancelledOrders: integer("cancelled_orders").notNull(),
    grossSalesPaise: integer("gross_sales_paise").notNull(),
    discountPaise: integer("discount_paise").notNull(),
    tipPaise: integer("tip_paise").notNull(),
    finalSalesPaise: integer("final_sales_paise").notNull(),
    cashPaymentsPaise: integer("cash_payments_paise").notNull(),
    upiPaymentsPaise: integer("upi_payments_paise").notNull(),
    cardPaymentsPaise: integer("card_payments_paise").notNull(),
    onlinePaymentsPaise: integer("online_payments_paise").notNull(),
    totalPaymentsPaise: integer("total_payments_paise").notNull(),
    nonCashPaymentsPaise: integer("non_cash_payments_paise").notNull(),
    billSummariesJson: text("bill_summaries_json").notNull(),
    itemSummariesJson: text("item_summaries_json").notNull(),
    groupSummariesJson: text("group_summaries_json").notNull().default("[]"),
    finalizedAt: text("finalized_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_daily_report_date").on(table.businessDate)]
);

export const floors = sqliteTable("floors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const saleGroups = sqliteTable("sale_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  reportLabel: text("report_label").notNull(),
  ticketLabel: text("ticket_label").notNull().default("KOT"),
  taxComponentsJson: text("tax_components_json").notNull().default("[]"),
  defaultProductionUnitId: text("default_production_unit_id").references(() => productionUnits.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const restaurantTables = sqliteTable(
  "restaurant_tables",
  {
    id: text("id").primaryKey(),
    floorId: text("floor_id").notNull().references(() => floors.id),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
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
  printerName: text("printer_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull(),
  productionUnitId: text("production_unit_id").references(() => productionUnits.id),
  saleGroupId: text("sale_group_id").notNull().default("sg-food").references(() => saleGroups.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const menuItemVariants = sqliteTable(
  "menu_item_variants",
  {
    id: text("id").primaryKey(),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    label: text("label").notNull(),
    kind: text("kind").notNull().default("default"),
    pricePaise: integer("price_paise").notNull(),
    volumeMl: integer("volume_ml"),
    inventoryAction: text("inventory_action").notNull().default("none"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true)
  },
  (table) => [
    index("idx_menu_item_variants_item").on(table.menuItemId),
    uniqueIndex("idx_menu_item_variants_item_kind").on(table.menuItemId, table.kind)
  ]
);

export const alcoholProfiles = sqliteTable("alcohol_profiles", {
  menuItemId: text("menu_item_id").primaryKey().references(() => menuItems.id),
  type: text("type").notNull(),
  largeBottleMl: integer("large_bottle_ml").notNull().default(750),
  smallBottleMl: integer("small_bottle_ml").notNull().default(180)
});

export const alcoholStockLevels = sqliteTable("alcohol_stock_levels", {
  menuItemId: text("menu_item_id").primaryKey().references(() => menuItems.id),
  sealedLargeCount: integer("sealed_large_count").notNull().default(0),
  openLargeMl: integer("open_large_ml").notNull().default(0),
  sealedSmallCount: integer("sealed_small_count").notNull().default(0),
  updatedAt: text("updated_at").notNull()
});

export const alcoholRecipeIngredients = sqliteTable(
  "alcohol_recipe_ingredients",
  {
    id: text("id").primaryKey(),
    productMenuItemId: text("product_menu_item_id").notNull().references(() => menuItems.id),
    liquorMenuItemId: text("liquor_menu_item_id").notNull().references(() => menuItems.id),
    mlPerUnit: integer("ml_per_unit").notNull()
  },
  (table) => [
    index("idx_alcohol_recipe_product").on(table.productMenuItemId),
    index("idx_alcohol_recipe_liquor").on(table.liquorMenuItemId)
  ]
);

export const alcoholStockMovements = sqliteTable(
  "alcohol_stock_movements",
  {
    id: text("id").primaryKey(),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    deltaSealedLarge: integer("delta_sealed_large").notNull().default(0),
    deltaOpenLargeMl: integer("delta_open_large_ml").notNull().default(0),
    deltaSealedSmall: integer("delta_sealed_small").notNull().default(0),
    balanceSealedLarge: integer("balance_sealed_large").notNull(),
    balanceOpenLargeMl: integer("balance_open_large_ml").notNull(),
    balanceSealedSmall: integer("balance_sealed_small").notNull(),
    approvedBy: text("approved_by"),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    index("idx_alcohol_stock_movements_item").on(table.menuItemId, table.createdAt),
    index("idx_alcohol_stock_movements_source").on(table.sourceType, table.sourceId)
  ]
);

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
    captainDeviceId: text("captain_device_id"),
    createdByDeviceId: text("created_by_device_id"),
    createdByRole: text("created_by_role"),
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
    menuItemId: text("menu_item_id").references(() => menuItems.id),
    menuItemVariantId: text("menu_item_variant_id").references(() => menuItemVariants.id),
    nameSnapshot: text("name_snapshot").notNull(),
    variantNameSnapshot: text("variant_name_snapshot").notNull().default(""),
    variantVolumeMl: integer("variant_volume_ml"),
    inventoryActionSnapshot: text("inventory_action_snapshot").notNull().default("none"),
    alcoholRecipeSnapshotJson: text("alcohol_recipe_snapshot_json").notNull().default("[]"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    quantity: integer("quantity").notNull(),
    productionUnitId: text("production_unit_id").references(() => productionUnits.id),
    saleGroupId: text("sale_group_id").notNull().default("sg-food").references(() => saleGroups.id),
    saleGroupNameSnapshot: text("sale_group_name_snapshot").notNull().default("Food"),
    saleGroupKindSnapshot: text("sale_group_kind_snapshot").notNull().default("food"),
    ticketLabelSnapshot: text("ticket_label_snapshot").notNull().default("KOT"),
    taxComponentsJson: text("tax_components_json").notNull().default("[]"),
    taxPaise: integer("tax_paise").notNull().default(0),
    isOpenItem: integer("is_open_item", { mode: "boolean" }).notNull().default(false),
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
  menuItemId: text("menu_item_id"),
  nameSnapshot: text("name_snapshot").notNull(),
  quantityDelta: integer("quantity_delta").notNull()
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
    taxBreakdownJson: text("tax_breakdown_json").notNull().default("[]"),
    revisionNumber: integer("revision_number").notNull().default(1),
    isNc: integer("is_nc", { mode: "boolean" }).notNull().default(false),
    ncReason: text("nc_reason"),
    ncApprovedBy: text("nc_approved_by"),
    ncMarkedAt: text("nc_marked_at"),
    printCount: integer("print_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    settledAt: text("settled_at")
});

export const billRevisions = sqliteTable(
  "bill_revisions",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id").notNull().references(() => bills.id),
    revisionNumber: integer("revision_number").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    taxPaise: integer("tax_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    tipPaise: integer("tip_paise").notNull().default(0),
    finalTotalPaise: integer("final_total_paise").notNull(),
    taxBreakdownJson: text("tax_breakdown_json").notNull().default("[]"),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_bill_revisions_bill").on(table.billId, table.revisionNumber)]
);

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

export const managerApprovals = sqliteTable(
  "manager_approvals",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    requestedBy: text("requested_by"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_manager_approvals_aggregate").on(table.aggregateType, table.aggregateId)]
);

export const orderMovements = sqliteTable(
  "order_movements",
  {
    id: text("id").primaryKey(),
    fromTableId: text("from_table_id").notNull(),
    toTableId: text("to_table_id").notNull(),
    sourceOrderId: text("source_order_id").notNull(),
    targetOrderId: text("target_order_id"),
    movedItemsJson: text("moved_items_json").notNull(),
    reason: text("reason").notNull(),
    movedBy: text("moved_by").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_order_movements_source").on(table.sourceOrderId, table.createdAt)]
);

export const readyNotifications = sqliteTable(
  "ready_notifications",
  {
    id: text("id").primaryKey(),
    kotId: text("kot_id").notNull().references(() => kots.id),
    orderId: text("order_id").notNull().references(() => orders.id),
    tableId: text("table_id").notNull().references(() => restaurantTables.id),
    tableName: text("table_name").notNull(),
    productionUnitId: text("production_unit_id").notNull().references(() => productionUnits.id),
    productionUnitName: text("production_unit_name").notNull(),
    captainDeviceId: text("captain_device_id"),
    captainId: text("captain_id").notNull(),
    itemsJson: text("items_json").notNull(),
    status: text("status").notNull().default("unread"),
    createdAt: text("created_at").notNull(),
    acknowledgedAt: text("acknowledged_at")
  },
  (table) => [index("idx_ready_notifications_device_status").on(table.captainDeviceId, table.status, table.createdAt)]
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

export const ticketTemplates = sqliteTable("ticket_templates", {
  id: text("id").primaryKey(),
  billHeader: text("bill_header").notNull().default(""),
  billFooter: text("bill_footer").notNull().default(""),
  kotHeader: text("kot_header").notNull().default(""),
  kotFooter: text("kot_footer").notNull().default(""),
  restaurantName: text("restaurant_name").notNull().default(""),
  taxRegistrationText: text("tax_registration_text").notNull().default(""),
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
