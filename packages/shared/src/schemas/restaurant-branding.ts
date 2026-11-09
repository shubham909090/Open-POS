import { z } from "zod";
import { masterApprovalSchema } from "./common.js";

export const RESTAURANT_LOGO_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const RESTAURANT_LOGO_MAX_DATA_URL_LENGTH = Math.ceil(RESTAURANT_LOGO_MAX_IMAGE_BYTES / 3) * 4 + 64;
export const logoCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1)
}).refine(crop => crop.x + crop.width <= 1 + Number.EPSILON && crop.y + crop.height <= 1 + Number.EPSILON, "Crop must stay inside the logo");
export type LogoCrop = z.infer<typeof logoCropSchema>;

export const restaurantBrandingSchema = z.object({
  restaurantName: z.string().trim().max(160),
  logoImageDataUrl: z.string().max(RESTAURANT_LOGO_MAX_DATA_URL_LENGTH).nullable(),
  iconImageDataUrl: z.string().max(RESTAURANT_LOGO_MAX_DATA_URL_LENGTH).nullable().optional(),
  iconCrop: logoCropSchema.nullable().optional(),
  updatedAt: z.string().datetime().nullable()
});
export const updateRestaurantBrandingSchema = z.object({
  restaurantName: z.string().trim().max(160),
  imageDataUrl: z.string().min(1).max(RESTAURANT_LOGO_MAX_DATA_URL_LENGTH).nullable().optional(),
  iconCrop: logoCropSchema.nullable().optional(),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  masterApproval: masterApprovalSchema.optional()
});
export const removeRestaurantLogoSchema = z.object({
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  masterApproval: masterApprovalSchema.optional()
});
export type RestaurantBranding = z.infer<typeof restaurantBrandingSchema>;
export type UpdateRestaurantBrandingInput = z.infer<typeof updateRestaurantBrandingSchema>;
export type RemoveRestaurantLogoInput = z.infer<typeof removeRestaurantLogoSchema>;
