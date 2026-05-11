import { z } from "zod";

const customIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{3,80}$/, "Use 3-80 letters, numbers, dashes, or underscores")
  .optional();

export const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(0)
});

export const submitOrderSchema = z.object({
  tableId: z.string().min(1),
  captainId: z.string().min(1),
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
  requestedBy: z.string().min(1)
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
  pricePaise: z.number().int().min(0),
  productionUnitId: z.string().min(1).nullable().optional(),
  active: z.boolean().default(true),
  customId: customIdSchema
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  pricePaise: z.number().int().min(0).optional(),
  productionUnitId: z.string().min(1).nullable().optional(),
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

export const createPairingCodeSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "cashier", "waiter", "kitchen"]),
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
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type ExchangePairingCodeInput = z.infer<typeof exchangePairingCodeSchema>;
export type RevokeDeviceInput = z.infer<typeof revokeDeviceSchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type ScheduleRestoreInput = z.infer<typeof scheduleRestoreSchema>;
