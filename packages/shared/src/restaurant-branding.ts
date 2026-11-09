import type { RestaurantBranding } from "./schemas/restaurant-branding.js";

/** An explicitly saved blank name is intentional; an unset identity retains legacy layouts. */
export function resolveReceiptRestaurantName(branding: RestaurantBranding | null | undefined, layoutName: string): string {
  if (branding && (branding.updatedAt !== null || branding.restaurantName.trim())) return branding.restaurantName;
  return layoutName;
}
