import { z } from "zod";
import { managerApprovalSchema, masterApprovalSchema } from "./common.js";

export const managerPinSchema = z.object({
  currentPin: z.string().trim().min(4).max(32).optional(),
  newPin: z.string().trim().min(4).max(32),
  updatedBy: z.string().trim().min(1).max(120)
});

export const setMasterPinSchema = z.object({
  currentPin: z.string().trim().min(4).max(32).optional(),
  newPin: z.string().trim().min(4).max(32),
  confirmPin: z.string().trim().min(4).max(32),
  updatedBy: z.string().trim().min(1).max(120)
}).refine((value) => value.newPin === value.confirmPin, "Master PIN confirmation does not match");

export const retryPrintJobSchema = z.object({
  requestedBy: z.string().min(1)
});

export const printerOutputModeSchema = z.enum(["test", "live"]);

export const updatePrinterOutputModeSchema = z.object({
  mode: printerOutputModeSchema
});

export const updateReceiptPrinterSchema = z.object({
  printerMode: z.enum(["system", "network"]).default("system"),
  printerName: z.string().trim().max(240).optional(),
  printerHost: z.string().trim().max(120).optional(),
  printerPort: z.number().int().min(1).max(65535).default(9100)
});

export const billPrinterProfileSchema = updateReceiptPrinterSchema.extend({
  label: z.string().trim().min(1).max(80).default("Bill printer")
});

export const updateBillPrintersSchema = z.object({
  default: billPrinterProfileSchema,
  alternate: billPrinterProfileSchema
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
  restaurantAddress: z.string().trim().max(500).default(""),
  taxRegistrationText: z.string().trim().max(240).default(""),
  lineWidthChars: z.number().int().min(24).max(64).default(28)
});

export const hubConnectionSettingsSchema = z.object({
  cloudUrl: z.string().trim().max(400).optional().default(""),
  installationId: z.string().trim().max(160).optional().default(""),
  syncSecret: z.string().trim().max(400).optional().default(""),
  hubPublicUrl: z.string().trim().max(400).optional().default("")
});

export const updateCloudBackupSchema = z.object({
  enabled: z.boolean(),
  masterApproval: masterApprovalSchema.optional()
});

export const printLayoutScopeSchema = z.enum(["default", "receipt", "unit"]);
export const printTextSizeSchema = z.enum(["small", "normal", "large"]);
export const printAlignSchema = z.enum(["left", "center", "right"]);
export const printSectionStyleSchema = z.object({
  size: printTextSizeSchema.default("normal"),
  bold: z.boolean().default(false),
  align: printAlignSchema.default("left")
});
export const printSectionStylesSchema = z.object({
  restaurantName: printSectionStyleSchema.default({ size: "large", bold: true, align: "center" }),
  address: printSectionStyleSchema.default({ size: "normal", bold: false, align: "center" }),
  header: printSectionStyleSchema.default({ size: "normal", bold: false, align: "center" }),
  title: printSectionStyleSchema.default({ size: "normal", bold: true, align: "center" }),
  metadata: printSectionStyleSchema.default({ size: "normal", bold: false, align: "left" }),
  items: printSectionStyleSchema.default({ size: "normal", bold: false, align: "left" }),
  totals: printSectionStyleSchema.default({ size: "normal", bold: true, align: "left" }),
  notes: printSectionStyleSchema.default({ size: "normal", bold: true, align: "left" }),
  itemNotes: printSectionStyleSchema.default({ size: "small", bold: false, align: "left" }),
  footer: printSectionStyleSchema.default({ size: "normal", bold: false, align: "center" })
});

export const printLayoutSettingsSchema = z.object({
  scope: printLayoutScopeSchema,
  productionUnitId: z.string().trim().min(1).optional(),
  restaurantName: z.string().trim().max(160).default(""),
  restaurantAddress: z.string().trim().max(500).default(""),
  taxRegistrationText: z.string().trim().max(240).default(""),
  billHeader: z.string().max(1_000).default(""),
  billFooter: z.string().max(1_000).default(""),
  kotHeader: z.string().max(1_000).default(""),
  kotFooter: z.string().max(1_000).default(""),
  lineWidthChars: z.number().int().min(24).max(64).default(28),
  headerAlign: z.enum(["left", "center"]).default("center"),
  footerAlign: z.enum(["left", "center"]).default("center"),
  sectionStyles: printSectionStylesSchema.default({}),
  topPaddingLines: z.number().int().min(0).max(6).default(0),
  feedLines: z.number().int().min(1).max(8).default(3),
  showTable: z.boolean().default(true),
  showCaptain: z.boolean().default(true),
  showDateTime: z.boolean().default(true),
  showBillId: z.boolean().default(true),
  showTaxBreakup: z.boolean().default(true),
  showPaymentSplit: z.boolean().default(true),
  showDiscountTip: z.boolean().default(true),
  showNcReprintRevision: z.boolean().default(true)
});

export const createPairingCodeSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "captain", "waiter", "kitchen"]),
  expiresInMinutes: z.number().int().min(1).max(120).default(10),
  managerApproval: managerApprovalSchema.optional()
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

export const fullResetSchema = z.object({
  managerApproval: managerApprovalSchema,
  confirmationText: z.string().trim(),
  includeBackups: z.boolean().default(false)
}).refine((value) => value.confirmationText === "RESET HUB", "Type RESET HUB to confirm");

export type ManagerPinInput = z.infer<typeof managerPinSchema>;
export type SetMasterPinInput = z.infer<typeof setMasterPinSchema>;
export type RetryPrintJobInput = z.infer<typeof retryPrintJobSchema>;
export type PrinterOutputMode = z.infer<typeof printerOutputModeSchema>;
export type UpdatePrinterOutputModeInput = z.infer<typeof updatePrinterOutputModeSchema>;
export type UpdateReceiptPrinterInput = z.infer<typeof updateReceiptPrinterSchema>;
export type BillPrinterProfileInput = z.infer<typeof billPrinterProfileSchema>;
export type UpdateBillPrintersInput = z.infer<typeof updateBillPrintersSchema>;
export type PrintActionInput = z.infer<typeof printActionSchema>;
export type TicketTemplateInput = z.infer<typeof ticketTemplateSchema>;
export type HubConnectionSettingsInput = z.infer<typeof hubConnectionSettingsSchema>;
export type UpdateCloudBackupInput = z.infer<typeof updateCloudBackupSchema>;
export type PrintLayoutScope = z.infer<typeof printLayoutScopeSchema>;
export type PrintLayoutSettingsInput = z.infer<typeof printLayoutSettingsSchema>;
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type ExchangePairingCodeInput = z.infer<typeof exchangePairingCodeSchema>;
export type RevokeDeviceInput = z.infer<typeof revokeDeviceSchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type ScheduleRestoreInput = z.infer<typeof scheduleRestoreSchema>;
export type FullResetInput = z.infer<typeof fullResetSchema>;
