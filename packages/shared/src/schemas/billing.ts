import { z } from "zod";
import { billPrinterSlotSchema, managerApprovalSchema, masterApprovalSchema } from "./common.js";
import { orderItemInputSchema, reprintKotSchema } from "./order.js";

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
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  tipPaise: z.number().int().min(0).optional(),
  payments: z.array(paymentInputSchema).optional()
});

export const billAdjustmentSchema = z.object({
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  tipPaise: z.number().int().min(0).optional()
});

export const billPrintDestinationSchema = z.object({
  printerSlot: billPrinterSlotSchema.default("default")
});

export const generateBillSchema = billPrintDestinationSchema.merge(billAdjustmentSchema);

export const reprintBillSchema = reprintKotSchema.extend({
  printerSlot: billPrinterSlotSchema.default("default"),
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  tipPaise: z.number().int().min(0).optional()
});

export const reviseBillSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  managerApproval: managerApprovalSchema
});

export const historyEditBillSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  masterApproval: masterApprovalSchema,
  printerSlot: billPrinterSlotSchema.default("default"),
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  tipPaise: z.number().int().min(0).optional(),
  payments: z.array(paymentInputSchema).optional()
});

export const markNcBillSchema = z.object({
  managerApproval: managerApprovalSchema,
  printerSlot: billPrinterSlotSchema.default("default"),
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
  tipPaise: z.number().int().min(0).optional()
});

export type SettleBillInput = z.input<typeof settleBillSchema>;
export type BillAdjustmentInput = z.input<typeof billAdjustmentSchema>;
export type GenerateBillInput = z.input<typeof generateBillSchema>;
export type ReprintBillInput = z.input<typeof reprintBillSchema>;
export type HistoryEditBillInput = z.input<typeof historyEditBillSchema>;
export type BillPrintDestinationInput = z.infer<typeof billPrintDestinationSchema>;
export type ReviseBillInput = z.infer<typeof reviseBillSchema>;
export type MarkNcBillInput = z.input<typeof markNcBillSchema>;
