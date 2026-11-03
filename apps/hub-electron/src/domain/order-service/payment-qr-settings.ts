import {
  PAYMENT_QR_MAX_IMAGE_BYTES,
  paymentQrSchema,
  type PaymentQr
} from "@gaurav-pos/shared";
import { createRequire } from "node:module";
import QRCode from "qrcode";
import sharp from "sharp";
import { DomainError } from "../errors.js";
import type { SettingReader } from "./printer-settings.js";

// jsqr publishes a CommonJS function with ESM-shaped declarations.
const jsQR = createRequire(import.meta.url)("jsqr") as typeof import("jsqr").default;

export const PAYMENT_QR_SETTING_KEY = "payment_qr_json";

export function readPaymentQr(read: SettingReader): PaymentQr | null {
  const stored = read(PAYMENT_QR_SETTING_KEY);
  if (!stored) return null;
  try {
    const parsed = paymentQrSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function preparePaymentQr(imageDataUrl: string, sizeMm = 32): Promise<PaymentQr> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match) throw new DomainError("Choose a PNG or JPG image of your payment QR", 400);
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.byteLength > PAYMENT_QR_MAX_IMAGE_BYTES) throw new DomainError("Choose a QR image smaller than 2 MB", 400);
  let pixels: { data: Buffer; info: { width: number; height: number } };
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== "png" && metadata.format !== "jpeg") throw new Error("Unsupported image format");
    pixels = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "white" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new DomainError("This image could not be read. Choose a clear PNG or JPG of the QR code.", 400);
  }
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.info.width, pixels.info.height, { inversionAttempts: "attemptBoth" });
  if (!decoded?.data) throw new DomainError("No readable QR code found. Upload a clear image with the entire QR visible.", 400);
  const upiUri = decoded.data;
  let payment: URL;
  try {
    payment = new URL(upiUri);
  } catch {
    throw new DomainError("This is not a UPI payment QR. Upload the payment QR from your UPI app.", 400);
  }
  const upiId = payment.searchParams.get("pa")?.trim() ?? "";
  if (payment.protocol !== "upi:" || payment.hostname !== "pay" || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(upiId) || upiId.length > 320 || upiUri.length > 4096) {
    throw new DomainError("This is not a valid UPI payment QR. Upload the payment QR from your UPI app.", 400);
  }
  const amount = payment.searchParams.get("am");
  if (amount !== null && (!/^0+(\.0+)?$/.test(amount))) {
    throw new DomainError("Upload a reusable payment QR without a fixed amount.", 400);
  }
  // Keep the exact payment payload: provider signatures and merchant parameters
  // must survive upload. Only the surrounding image is regenerated for scanning.
  const qrOptions = {
    type: "image/png",
    margin: 4,
    scale: 8,
    color: { dark: "#000000", light: "#ffffff" }
  } as const;
  let canonicalImage: string;
  try {
    canonicalImage = await QRCode.toDataURL(upiUri, { ...qrOptions, errorCorrectionLevel: "M" });
  } catch {
    // Dense provider QR codes can use lower error correction to fit. Preserve
    // their payload instead of dropping provider parameters to shorten it.
    try {
      canonicalImage = await QRCode.toDataURL(upiUri, { ...qrOptions, errorCorrectionLevel: "L" });
    } catch {
      throw new DomainError("This payment QR contains too much data. Choose another reusable UPI QR.", 400);
    }
  }
  const canonicalWidth = (await sharp(Buffer.from(canonicalImage.split(",")[1]!, "base64")).metadata()).width!;
  // The narrowest supported roll has 304 usable dots. Each module needs at
  // least two dots; reject codes that could never print safely on that roll.
  if (canonicalWidth / 8 * 2 > 304) throw new DomainError("This payment QR is too detailed for narrow bill paper. Upload a simpler reusable UPI QR.", 400);
  return {
    imageDataUrl: canonicalImage,
    upiUri,
    upiId,
    payeeName: (payment.searchParams.get("pn") ?? "").trim().slice(0, 160),
    sizeMm,
    updatedAt: new Date().toISOString()
  };
}
