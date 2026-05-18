import { z } from "zod";

const customIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{3,80}$/, "Use 3-80 letters, numbers, dashes, or underscores")
  .optional();

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
  sortOrder: z.number().int().min(0).optional(),
  customId: customIdSchema
});

export const updateFloorSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
});

export const createTableSchema = z.object({
  floorId: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
  customId: customIdSchema
});

export const updateTableSchema = z.object({
  floorId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
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

export const importCsvSchema = z.object({
  csv: z.string().min(1).max(2_000_000)
});

export const importAlcoholCsvSchema = importCsvSchema.extend({
  type: z.enum(["plain_liquor", "prepared_product"])
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  pricePaise: z.number().int().min(1).optional(),
  productionUnitId: z.string().min(1).nullable().optional(),
  saleGroupId: z.string().min(1).optional(),
  active: z.boolean().optional()
});

export const bulkDeleteMenuItemsSchema = z.object({
  managerApproval: managerApprovalSchema.optional()
});

export const bulkDeleteAlcoholItemsSchema = z.object({
  masterApproval: masterApprovalSchema.optional()
});

export const menuItemDeleteApprovalSchema = z.object({
  managerApproval: managerApprovalSchema.optional(),
  masterApproval: masterApprovalSchema.optional()
});

export const menuItemVariantSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["default", "shot", "small_bottle", "large_bottle"]).default("default"),
  pricePaise: z.number().int().min(1),
  volumeMl: z.number().int().min(1).nullable().optional(),
  inventoryAction: z.enum(["none", "large_ml", "small_bottle", "large_bottle"]).default("none"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0)
});

export const alcoholRecipeIngredientSchema = z.object({
  liquorMenuItemId: z.string().min(1),
  mlPerUnit: z.number().int().min(1).max(10_000)
});

export const createAlcoholItemSchema = z.object({
  type: z.enum(["plain_liquor", "prepared_product"]),
  name: z.string().trim().min(1).max(160),
  productionUnitId: z.string().min(1).nullable().optional(),
  largeBottleMl: z.number().int().min(1).max(10_000).default(750),
  smallBottleMl: z.number().int().min(1).max(10_000).default(180),
  sealedLargeCount: z.number().int().min(-100_000).default(0),
  openLargeMl: z.number().int().min(-1_000_000).default(0),
  sealedSmallCount: z.number().int().min(-100_000).default(0),
  variants: z.array(menuItemVariantSchema).min(1).max(8),
  recipeIngredients: z.array(alcoholRecipeIngredientSchema).max(20).default([]),
  active: z.boolean().default(true)
});

export const updateAlcoholItemSchema = createAlcoholItemSchema.partial().extend({
  variants: z.array(menuItemVariantSchema).min(1).max(8).optional(),
  recipeIngredients: z.array(alcoholRecipeIngredientSchema).max(20).optional()
});

export const adjustAlcoholStockSchema = z.object({
  managerApproval: managerApprovalSchema.optional(),
  masterApproval: masterApprovalSchema.optional(),
  mode: z.enum(["delta", "set"]),
  sealedLargeCount: z.number().int().min(-100_000).optional(),
  openLargeMl: z.number().int().min(-1_000_000).optional(),
  sealedSmallCount: z.number().int().min(-100_000).optional()
});

export const updateKotStatusSchema = z.object({
  status: z.enum(["queued", "preparing", "ready", "served", "cancelled"])
});

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

export const billPrintDestinationSchema = z.object({
  printerSlot: billPrinterSlotSchema.default("default")
});

export const reprintBillSchema = reprintKotSchema.extend({
  printerSlot: billPrinterSlotSchema.default("default")
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

export const reviseBillSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  managerApproval: managerApprovalSchema
});

export const historyEditBillSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  masterApproval: masterApprovalSchema,
  printerSlot: billPrinterSlotSchema.default("default")
});

export const markNcBillSchema = z.object({
  managerApproval: managerApprovalSchema,
  printerSlot: billPrinterSlotSchema.default("default")
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

type ParsedSubmitOrderInput = z.infer<typeof submitOrderSchema>;
export type SubmitOrderInput = Omit<ParsedSubmitOrderInput, "printMode"> & { printMode?: ParsedSubmitOrderInput["printMode"] };
export type UpdateOrderStateInput = z.input<typeof updateOrderStateSchema>;
export type SettleBillInput = z.input<typeof settleBillSchema>;
export type ReprintKotInput = z.infer<typeof reprintKotSchema>;
export type ReprintBillInput = z.input<typeof reprintBillSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CancelOrderItemsInput = z.infer<typeof cancelOrderItemsSchema>;
export type ManagerApprovalInput = z.infer<typeof managerApprovalSchema>;
export type MasterApprovalInput = z.infer<typeof masterApprovalSchema>;
export type ManagerPinInput = z.infer<typeof managerPinSchema>;
export type SetMasterPinInput = z.infer<typeof setMasterPinSchema>;
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
export type BulkDeleteMenuItemsInput = z.infer<typeof bulkDeleteMenuItemsSchema>;
export type BulkDeleteAlcoholItemsInput = z.infer<typeof bulkDeleteAlcoholItemsSchema>;
export type MenuItemDeleteApprovalInput = z.infer<typeof menuItemDeleteApprovalSchema>;
export type ImportCsvInput = z.infer<typeof importCsvSchema>;
export type ImportAlcoholCsvInput = z.infer<typeof importAlcoholCsvSchema>;
export type CreateAlcoholItemInput = z.input<typeof createAlcoholItemSchema>;
export type UpdateAlcoholItemInput = z.infer<typeof updateAlcoholItemSchema>;
export type AdjustAlcoholStockInput = z.infer<typeof adjustAlcoholStockSchema>;
export type HistoryEditBillInput = z.input<typeof historyEditBillSchema>;
export type UpdateKotStatusInput = z.infer<typeof updateKotStatusSchema>;
export type RetryPrintJobInput = z.infer<typeof retryPrintJobSchema>;
export type PrinterOutputMode = z.infer<typeof printerOutputModeSchema>;
export type BillPrinterSlot = z.infer<typeof billPrinterSlotSchema>;
export type UpdatePrinterOutputModeInput = z.infer<typeof updatePrinterOutputModeSchema>;
export type UpdateReceiptPrinterInput = z.infer<typeof updateReceiptPrinterSchema>;
export type BillPrinterProfileInput = z.infer<typeof billPrinterProfileSchema>;
export type UpdateBillPrintersInput = z.infer<typeof updateBillPrintersSchema>;
export type BillPrintDestinationInput = z.infer<typeof billPrintDestinationSchema>;
export type PrintActionInput = z.infer<typeof printActionSchema>;
export type TicketTemplateInput = z.infer<typeof ticketTemplateSchema>;
export type ManagerPinUnlockInput = z.infer<typeof managerPinUnlockSchema>;
export type HubConnectionSettingsInput = z.infer<typeof hubConnectionSettingsSchema>;
export type PrintLayoutScope = z.infer<typeof printLayoutScopeSchema>;
export type PrintLayoutSettingsInput = z.infer<typeof printLayoutSettingsSchema>;
export type ReviseBillInput = z.infer<typeof reviseBillSchema>;
export type MarkNcBillInput = z.input<typeof markNcBillSchema>;
export type MoveTableInput = z.infer<typeof moveTableSchema>;
export type MoveOrderItemsInput = z.infer<typeof moveOrderItemsSchema>;
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type ExchangePairingCodeInput = z.infer<typeof exchangePairingCodeSchema>;
export type RevokeDeviceInput = z.infer<typeof revokeDeviceSchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type ScheduleRestoreInput = z.infer<typeof scheduleRestoreSchema>;
export type FullResetInput = z.infer<typeof fullResetSchema>;
