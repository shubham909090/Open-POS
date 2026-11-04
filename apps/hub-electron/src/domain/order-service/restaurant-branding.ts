import { RESTAURANT_LOGO_MAX_IMAGE_BYTES, restaurantBrandingSchema, type RestaurantBranding } from "@gaurav-pos/shared";
import sharp from "sharp";
import { DomainError } from "../errors.js";
import type { SettingReader } from "./printer-settings.js";

export const RESTAURANT_BRANDING_SETTING_KEY = "restaurant_branding_json";
export function readRestaurantBranding(read: SettingReader): RestaurantBranding {
  const stored = read(RESTAURANT_BRANDING_SETTING_KEY);
  if (stored) {
    try {
      const result = restaurantBrandingSchema.safeParse(JSON.parse(stored));
      if (result.success) return result.data;
    } catch { /* An unreadable optional setting must not prevent service. */ }
  }
  return { restaurantName: read("ticket_restaurant_name") ?? "", logoImageDataUrl: null, updatedAt: null };
}

export async function prepareRestaurantLogo(imageDataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match) throw new DomainError("Choose a PNG or JPG restaurant logo", 400);
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > RESTAURANT_LOGO_MAX_IMAGE_BYTES) throw new DomainError("Choose a logo smaller than 2 MB", 400);
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    if (!["png", "jpeg"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported logo");
    const png = await image.rotate().resize({ width: 640, height: 320, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    throw new DomainError("This logo could not be read. Choose a PNG or JPG image up to 16 megapixels.", 400);
  }
}
