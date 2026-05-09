import { z } from "zod";

export const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(0),
  notes: z.string().trim().max(500).optional()
});

export const submitOrderSchema = z.object({
  tableId: z.string().min(1),
  captainId: z.string().min(1),
  pax: z.number().int().min(1).max(99).default(1),
  orderType: z.enum(["dine_in", "takeaway"]).default("dine_in"),
  notes: z.string().trim().max(1000).optional(),
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

export const settleBillSchema = z.object({
  method: z.enum(["cash", "upi", "card"]).default("cash"),
  amountPaise: z.number().int().min(0),
  receivedBy: z.string().min(1)
});

export const reprintKotSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestedBy: z.string().min(1)
});

export const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export const createTableSchema = z.object({
  floorId: z.string().min(1),
  name: z.string().trim().min(1).max(40)
});

export const createProductionUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  printerHost: z.string().trim().min(1).max(120),
  printerPort: z.number().int().min(1).max(65535).default(9100),
  kdsEnabled: z.boolean().default(true)
});

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  pricePaise: z.number().int().min(0),
  productionUnitId: z.string().min(1),
  active: z.boolean().default(true)
});

export const updateKotStatusSchema = z.object({
  status: z.enum(["queued", "preparing", "ready", "served", "cancelled"])
});

export const retryPrintJobSchema = z.object({
  requestedBy: z.string().min(1)
});

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
export type OpenPosDayInput = z.infer<typeof openPosDaySchema>;
export type ClosePosDayInput = z.infer<typeof closePosDaySchema>;
export type SettleBillInput = z.infer<typeof settleBillSchema>;
export type ReprintKotInput = z.infer<typeof reprintKotSchema>;
export type CreateFloorInput = z.infer<typeof createFloorSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type CreateProductionUnitInput = z.infer<typeof createProductionUnitSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateKotStatusInput = z.infer<typeof updateKotStatusSchema>;
export type RetryPrintJobInput = z.infer<typeof retryPrintJobSchema>;
