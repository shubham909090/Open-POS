import { RESTAURANT_LOGO_MAX_IMAGE_BYTES, RESTAURANT_LOGO_NORMALIZATION, restaurantBrandingSchema, logoCropSchema, type LogoCrop, type RestaurantBranding } from "@gaurav-pos/shared";
import sharp from "sharp";
import { DomainError } from "../errors.js";
import type { SettingReader } from "./printer-settings.js";

export const RESTAURANT_BRANDING_SETTING_KEY = "restaurant_branding_json";
export function readRestaurantBranding(read: SettingReader): RestaurantBranding {
  const stored = read(RESTAURANT_BRANDING_SETTING_KEY);
  if (stored) {
    try {
      const result = restaurantBrandingSchema.safeParse(JSON.parse(stored));
      if (result.success) return { ...result.data, iconCrop: result.data.iconCrop ?? null, iconImageDataUrl: result.data.iconImageDataUrl ?? null };
    } catch { /* An unreadable optional setting must not prevent service. */ }
  }
  return { restaurantName: read("ticket_restaurant_name") ?? "", logoImageDataUrl: null, iconCrop: null, iconImageDataUrl: null, updatedAt: null };
}

export async function prepareRestaurantLogo(imageDataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match) throw new DomainError("Choose a PNG or JPG restaurant logo", 400);
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > RESTAURANT_LOGO_MAX_IMAGE_BYTES) throw new DomainError("Choose a logo smaller than 2 MB", 400);
  try {
    const image = sharp(bytes, { limitInputPixels: RESTAURANT_LOGO_NORMALIZATION.maxInputPixels, animated: false });
    const metadata = await image.metadata();
    if (!["png", "jpeg"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported logo");
    // Keep enough source detail for both app branding and full-width receipts.
    // Detailed JPEG uploads can grow as PNG. Reduce dimensions only when
    // needed to keep the stored PNG within the existing two-megabyte budget.
    for (const dimension of RESTAURANT_LOGO_NORMALIZATION.dimensions) {
      const png = await image.clone().rotate().resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      if (png.length <= RESTAURANT_LOGO_MAX_IMAGE_BYTES) return `data:image/png;base64,${png.toString("base64")}`;
    }
    throw new Error("Logo is too detailed");
  } catch {
    throw new DomainError("This logo could not be read. Choose a PNG or JPG image up to 16 megapixels.", 400);
  }
}

export async function prepareRestaurantIcon(imageDataUrl: string, crop: LogoCrop | null): Promise<string> {
  const image = sharp(Buffer.from(imageDataUrl.split(",")[1]!, "base64"), {
    limitInputPixels: RESTAURANT_LOGO_NORMALIZATION.maxInputPixels
  });
  if (crop) {
    const parsed = logoCropSchema.safeParse(crop);
    if (!parsed.success) throw new DomainError("Keep the icon crop inside the logo", 400);
    const { width, height } = await image.metadata();
    if (!width || !height) throw new DomainError("This logo could not be read", 400);
    const left = Math.round(crop.x * width);
    const top = Math.round(crop.y * height);
    const cropWidth = Math.round(crop.width * width);
    const cropHeight = Math.round(crop.height * height);
    if (cropWidth < 1 || cropHeight < 1 || Math.abs(cropWidth - cropHeight) > 1) {
      throw new DomainError("Choose a square area for the app icon", 400);
    }
    image.extract({ left, top, width: Math.min(cropWidth, width - left), height: Math.min(cropHeight, height - top) });
  }
  const icon = await image.resize({
    width: RESTAURANT_LOGO_NORMALIZATION.iconSize,
    height: RESTAURANT_LOGO_NORMALIZATION.iconSize,
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 0 }
  }).png().toBuffer();
  return `data:image/png;base64,${icon.toString("base64")}`;
}
