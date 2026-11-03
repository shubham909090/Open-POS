import { z } from "zod";
import { masterApprovalSchema } from "./common.js";

export const PAYMENT_QR_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const PAYMENT_QR_MAX_DATA_URL_LENGTH = Math.ceil(PAYMENT_QR_MAX_IMAGE_BYTES / 3) * 4 + 64;

export const paymentQrSchema = z.object({
  imageDataUrl: z.string().max(PAYMENT_QR_MAX_DATA_URL_LENGTH),
  upiUri: z.string().min(1).max(4096),
  upiId: z.string().min(1).max(320),
  payeeName: z.string().max(160),
  sizeMm: z.number().int().min(20).max(45).default(32),
  updatedAt: z.string().datetime()
});

export const updatePaymentQrSchema = z.object({
  imageDataUrl: z.string().min(1).max(PAYMENT_QR_MAX_DATA_URL_LENGTH, "Choose a QR image smaller than 2 MB"),
  sizeMm: z.number().int().min(20).max(45).default(32),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  masterApproval: masterApprovalSchema.optional()
});

export const removePaymentQrSchema = z.object({
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  masterApproval: masterApprovalSchema.optional()
});

export type PaymentQr = z.infer<typeof paymentQrSchema>;
export type UpdatePaymentQrInput = z.infer<typeof updatePaymentQrSchema>;
export type RemovePaymentQrInput = z.infer<typeof removePaymentQrSchema>;
