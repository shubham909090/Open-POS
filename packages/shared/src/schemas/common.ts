import { z } from "zod";

export const customIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{3,80}$/, "Use 3-80 letters, numbers, dashes, or underscores")
  .optional();

export const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid business date");

export const businessDateToMs = (value: string) => new Date(`${value}T00:00:00.000Z`).getTime();

export const saleGroupKindSchema = z.enum(["food", "alcohol", "beverage", "other"]);
export const ticketLabelSchema = z.enum(["KOT", "BOT"]);
export const orderPrintModeSchema = z.enum(["kot", "kot_print"]);
export const orderStateSaveModeSchema = z.enum(["save", "save_print"]);
export const billPrinterSlotSchema = z.enum(["default", "alternate"]);

export const taxComponentSchema = z.object({
  name: z.string().trim().min(1).max(40),
  rateBps: z.number().int().min(0).max(100_000)
});

export const managerApprovalSchema = z.object({
  pin: z.string().trim().min(4).max(32),
  reason: z.string().trim().min(3).max(500),
  approvedBy: z.string().trim().min(1).max(120)
});

export const masterApprovalSchema = managerApprovalSchema;

export const managerPinUnlockSchema = z.object({
  pin: z.string().trim().min(4).max(32)
});

export type ManagerApprovalInput = z.infer<typeof managerApprovalSchema>;
export type MasterApprovalInput = z.infer<typeof masterApprovalSchema>;
export type ManagerPinUnlockInput = z.infer<typeof managerPinUnlockSchema>;
export type BillPrinterSlot = z.infer<typeof billPrinterSlotSchema>;
