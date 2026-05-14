import { z } from "zod";

const customIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{3,80}$/, "Use 3-80 letters, numbers, dashes, or underscores")
  .optional();

export const saleGroupKindSchema = z.enum(["food", "alcohol", "beverage", "other"]);
export const ticketLabelSchema = z.enum(["KOT", "BOT"]);

export const taxComponentSchema = z.object({
  name: z.string().trim().min(1).max(40),
  rateBps: z.number().int().min(0).max(100_000)
});

export const managerApprovalSchema = z.object({
  pin: z.string().trim().min(4).max(32),
  reason: z.string().trim().min(3).max(500),
  approvedBy: z.string().trim().min(1).max(120)
});

export const orderItemInputSchema = z.object({
  orderItemId: z.string().min(1).optional(),
  menuItemId: z.string().min(1).optional(),
  quantity: z.number().int().min(0),
  openName: z.string().trim().min(1).max(160).optional(),
  openPricePaise: z.number().int().min(1).optional(),
  saleGroupId: z.string().trim().min(1).optional(),
  productionUnitId: z.string().trim().min(1).nullable().optional(),
  unitPricePaise: z.number().int().min(1).optional(),
  managerApproval: managerApprovalSchema.optional()
}).refine((item) => Boolean(item.menuItemId || item.openName), "Choose a dish or enter an open item name");

export const submitOrderSchema = z.object({
  tableId: z.string().min(1),
  captainId: z.string().min(1).optional(),
  pax: z.number().int().min(1).max(99).default(1),
  orderType: z.enum(["dine_in", "takeaway"]).default("dine_in"),
  items: z.array(orderItemInputSchema).min(1)
});

export const openPosDaySchema = z.object({
  outletId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCashPaise: z.number().int().min(0),
  openedBy: z.string().min(1)
});

export const closePosDaySchema = z.object({
  closingCashPaise: z.number().int().min(0),
  closedBy: z.string().min(1)
});

export const paymentInputSchema = z.object({
  method: z.enum(["cash", "upi", "card", "online"]).default("cash"),
  amountPaise: z.number().int().min(0),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(240).optional()
});

export const settleBillSchema = z.object({
  method: z.enum(["cash", "upi", "card", "online"]).default("cash").optional(),
  amountPaise: z.number().int().min(0).optional(),
  receivedBy: z.string().min(1),
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.number().min(0).default(0),
  tipPaise: z.number().int().min(0).default(0),
  payments: z.array(paymentInputSchema).optional()
});

export const reprintKotSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestedBy: z.string().min(1),
  managerApproval: managerApprovalSchema.optional()
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestedBy: z.string().trim().min(1).max(120).default("cashier"),
  managerApproval: managerApprovalSchema.optional()
});

export const managerPinSchema = z.object({
  currentPin: z.string().trim().min(4).max(32).optional(),
  newPin: z.string().trim().min(4).max(32),
  updatedBy: z.string().trim().min(1).max(120)
});

export const createSaleGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: saleGroupKindSchema,
  reportLabel: z.string().trim().min(1).max(80).optional(),
  ticketLabel: ticketLabelSchema.default("KOT"),
  defaultProductionUnitId: z.string().trim().min(1).nullable().optional(),
  taxComponents: z.array(taxComponentSchema).max(4).default([]),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateSaleGroupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: saleGroupKindSchema.optional(),
  reportLabel: z.string().trim().min(1).max(80).optional(),
  ticketLabel: ticketLabelSchema.optional(),
  defaultProductionUnitId: z.string().trim().min(1).nullable().optional(),
  taxComponents: z.array(taxComponentSchema).max(4).optional(),
  active: z.boolean().optional()
});

export const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateFloorSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional()
});

export const createTableSchema = z.object({
  floorId: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateTableSchema = z.object({
  floorId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional()
});

export const createProductionUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  printerMode: z.enum(["system", "network"]).default("system"),
  printerName: z.string().trim().max(240).optional(),
  printerHost: z.string().trim().max(120).optional(),
  printerPort: z.number().int().min(1).max(65535).default(9100),
  kdsEnabled: z.boolean().default(true),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateProductionUnitSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  printerMode: z.enum(["system", "network"]).optional(),
  printerName: z.string().trim().max(240).nullable().optional(),
  printerHost: z.string().trim().max(120).optional(),
  printerPort: z.number().int().min(1).max(65535).optional(),
  kdsEnabled: z.boolean().optional(),
  active: z.boolean().optional()
});

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  pricePaise: z.number().int().min(1),
  productionUnitId: z.string().min(1).nullable().optional(),
  saleGroupId: z.string().min(1).optional(),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  pricePaise: z.number().int().min(1).optional(),
  productionUnitId: z.string().min(1).nullable().optional(),
  saleGroupId: z.string().min(1).optional(),
  active: z.boolean().optional()
});

export const updateKotStatusSchema = z.object({
  status: z.enum(["queued", "preparing", "ready", "served", "cancelled"])
});

export const retryPrintJobSchema = z.object({
  requestedBy: z.string().min(1)
});

export const updateReceiptPrinterSchema = z.object({
  printerMode: z.enum(["system", "network"]).default("system"),
  printerName: z.string().trim().max(240).optional(),
  printerHost: z.string().trim().max(120).optional(),
  printerPort: z.number().int().min(1).max(65535).default(9100)
});

export const printActionSchema = z.object({
  mode: z.enum(["kot_only", "bill_only", "kot_and_bill"]).default("kot_only")
});

export const ticketTemplateSchema = z.object({
  billHeader: z.string().max(1_000).default(""),
  billFooter: z.string().max(1_000).default(""),
  kotHeader: z.string().max(1_000).default(""),
  kotFooter: z.string().max(1_000).default(""),
  restaurantName: z.string().trim().max(160).default(""),
  taxRegistrationText: z.string().trim().max(240).default("")
});

export const reviseBillSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  managerApproval: managerApprovalSchema
});

export const markNcBillSchema = z.object({
  managerApproval: managerApprovalSchema
});

export const moveTableSchema = z.object({
  fromTableId: z.string().min(1),
  toTableId: z.string().min(1),
  movedBy: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(3).max(500).default("Table shifted")
});

export const moveOrderItemsSchema = z.object({
  fromTableId: z.string().min(1),
  toTableId: z.string().min(1),
  movedBy: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(3).max(500).default("Items shifted"),
  items: z.array(z.object({
    orderItemId: z.string().min(1),
    quantity: z.number().int().min(1)
  })).min(1)
});

export const createPairingCodeSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "cashier", "captain", "waiter", "kitchen"]),
  expiresInMinutes: z.number().int().min(1).max(120).default(10)
});

export const exchangePairingCodeSchema = z.object({
  code: z.string().trim().min(4).max(12),
  deviceName: z.string().trim().min(1).max(120)
});

export const revokeDeviceSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

export const createBackupSchema = z.object({
  label: z.string().trim().max(80).optional()
});

export const scheduleRestoreSchema = z.object({
  fileName: z.string().trim().min(1).max(260)
});

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
export type OpenPosDayInput = z.infer<typeof openPosDaySchema>;
export type ClosePosDayInput = z.infer<typeof closePosDaySchema>;
export type SettleBillInput = z.input<typeof settleBillSchema>;
export type ReprintKotInput = z.infer<typeof reprintKotSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ManagerApprovalInput = z.infer<typeof managerApprovalSchema>;
export type ManagerPinInput = z.infer<typeof managerPinSchema>;
export type CreateSaleGroupInput = z.input<typeof createSaleGroupSchema>;
export type UpdateSaleGroupInput = z.infer<typeof updateSaleGroupSchema>;
export type CreateFloorInput = z.input<typeof createFloorSchema>;
export type UpdateFloorInput = z.infer<typeof updateFloorSchema>;
export type CreateTableInput = z.input<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type CreateProductionUnitInput = z.input<typeof createProductionUnitSchema>;
export type UpdateProductionUnitInput = z.infer<typeof updateProductionUnitSchema>;
export type CreateMenuItemInput = z.input<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type UpdateKotStatusInput = z.infer<typeof updateKotStatusSchema>;
export type RetryPrintJobInput = z.infer<typeof retryPrintJobSchema>;
export type UpdateReceiptPrinterInput = z.infer<typeof updateReceiptPrinterSchema>;
export type PrintActionInput = z.infer<typeof printActionSchema>;
export type TicketTemplateInput = z.infer<typeof ticketTemplateSchema>;
export type ReviseBillInput = z.infer<typeof reviseBillSchema>;
export type MarkNcBillInput = z.infer<typeof markNcBillSchema>;
export type MoveTableInput = z.infer<typeof moveTableSchema>;
export type MoveOrderItemsInput = z.infer<typeof moveOrderItemsSchema>;
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type ExchangePairingCodeInput = z.infer<typeof exchangePairingCodeSchema>;
export type RevokeDeviceInput = z.infer<typeof revokeDeviceSchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type ScheduleRestoreInput = z.infer<typeof scheduleRestoreSchema>;
