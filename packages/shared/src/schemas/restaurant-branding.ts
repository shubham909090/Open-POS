import { z } from "zod";
import { masterApprovalSchema } from "./common.js";

export const RESTAURANT_LOGO_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const RESTAURANT_LOGO_MAX_DATA_URL_LENGTH = Math.ceil(RESTAURANT_LOGO_MAX_IMAGE_BYTES / 3) * 4 + 64;
export const restaurantBrandingSchema = z.object({
  restaurantName: z.string().trim().max(160),
  logoImageDataUrl: z.string().max(RESTAURANT_LOGO_MAX_DATA_URL_LENGTH).nullable(),
  updatedAt: z.string().datetime().nullable()
});
export const updateRestaurantBrandingSchema = z.object({
  restaurantName: z.string().trim().max(160),
  imageDataUrl: z.string().min(1).max(RESTAURANT_LOGO_MAX_DATA_URL_LENGTH).nullable().optional(),
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
