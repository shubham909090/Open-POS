import { z } from "zod";
import {
  managerApprovalSchema,
  orderPrintModeSchema,
  orderStateSaveModeSchema
} from "./common.js";

export const orderItemInputSchema = z.object({
  orderItemId: z.string().min(1).optional(),
  menuItemId: z.string().min(1).optional(),
  menuItemVariantId: z.string().min(1).optional(),
  quantity: z.number().int().min(0),
  note: z.string().trim().max(500).optional(),
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
  printMode: orderPrintModeSchema.default("kot_print"),
  note: z.string().trim().max(500).optional(),
  items: z.array(orderItemInputSchema).min(1)
});

export const updateOrderStateSchema = z.object({
  saveMode: orderStateSaveModeSchema.default("save"),
  items: z.array(orderItemInputSchema),
  managerApproval: managerApprovalSchema.optional()
});

export const reprintKotSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestedBy: z.string().min(1),
  managerApproval: managerApprovalSchema.optional()
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  requestedBy: z.string().trim().min(1).max(120).default("captain"),
  managerApproval: managerApprovalSchema.optional()
});

export const cancelOrderItemsSchema = z.object({
  reason: z.string().trim().min(3).max(500).default("Item cancelled"),
  requestedBy: z.string().trim().min(1).max(120).default("captain"),
  managerApproval: managerApprovalSchema,
  items: z.array(z.object({
    orderItemId: z.string().min(1),
    quantity: z.number().int().min(1)
  })).min(1)
});

export const updateKotStatusSchema = z.object({
  status: z.enum(["queued", "preparing", "ready", "served", "cancelled"])
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

type ParsedSubmitOrderInput = z.infer<typeof submitOrderSchema>;
export type SubmitOrderInput = Omit<ParsedSubmitOrderInput, "printMode"> & { printMode?: ParsedSubmitOrderInput["printMode"] };
export type UpdateOrderStateInput = z.input<typeof updateOrderStateSchema>;
export type ReprintKotInput = z.infer<typeof reprintKotSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CancelOrderItemsInput = z.infer<typeof cancelOrderItemsSchema>;
export type UpdateKotStatusInput = z.infer<typeof updateKotStatusSchema>;
export type MoveTableInput = z.infer<typeof moveTableSchema>;
export type MoveOrderItemsInput = z.infer<typeof moveOrderItemsSchema>;
