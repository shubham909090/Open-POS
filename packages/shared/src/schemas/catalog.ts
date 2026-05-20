import { z } from "zod";
import {
  customIdSchema,
  managerApprovalSchema,
  masterApprovalSchema,
  saleGroupKindSchema,
  taxComponentSchema,
  ticketLabelSchema
} from "./common.js";

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
