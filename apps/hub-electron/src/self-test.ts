import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubDatabase } from "./db/database.js";
import QRCode from "qrcode";
import { preparePaymentQr } from "./domain/order-service/payment-qr-settings.js";
import { textBitmap } from "./printing/ticket-raster.js";

export function runSqliteSelfTest(): void {
  const root = mkdtempSync(join(tmpdir(), "gaurav-pos-sqlite-self-test-"));
  const databasePath = join(root, "self-test.sqlite");
  const database = new HubDatabase(databasePath);
  try {
    database.migrate();
    database.integrityCheck();
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
}

export async function runPrintSelfTest(): Promise<void> {
  const uri = "upi://pay?pa=print-self-test@upi&pn=Print%20self%20test";
  const qr = await preparePaymentQr(await QRCode.toDataURL(uri));
  if (qr.upiUri !== uri) throw new Error("Packaged payment QR decoding failed");
  const bitmap = textBitmap({ text: "Print self-test", plainText: "Print self-test", size: "normal", sizeLevel: 5, bold: false, align: "left" }, 384);
  if (!bitmap.data.some((value, index) => index % 4 < 3 && value < 128)) throw new Error("Packaged text rasterization failed");
}

