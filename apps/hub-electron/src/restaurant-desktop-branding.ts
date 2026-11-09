import { app, nativeImage, shell, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { RestaurantBranding } from "@gaurav-pos/shared";

const WINDOWS_APP_ID = "in.gaurav.pos.hub";
const SHORTCUT_NAME = "Gaurav POS Hub.lnk";

export function pngIconFile(png: Buffer): Buffer {
  // Windows accepts a PNG-compressed 256px image inside an ICO directory.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

async function restaurantIcon(branding: RestaurantBranding): Promise<Buffer> {
  const image = branding.iconImageDataUrl || branding.logoImageDataUrl;
  if (image) {
    return sharp(Buffer.from(image.split(",")[1]!, "base64"))
      .resize(256, 256, { fit: "contain", background: "#ffffff00" })
      .png().toBuffer();
  }
  const name = branding.restaurantName.trim() || "Restaurant";
  const initial = Array.from(name)[0]!.toLocaleUpperCase()
    .replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="48" fill="#25221e"/><text x="128" y="178" text-anchor="middle" font-family="sans-serif" font-size="160" fill="#ffffff">${initial}</text></svg>`))
    .png().toBuffer();
}

function updateWindowsShortcuts(iconPath: string) {
  const programs = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs");
  const shortcuts = [
    path.join(app.getPath("desktop"), SHORTCUT_NAME),
    path.join(app.getPath("appData"), "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", SHORTCUT_NAME),
    path.join(programs, SHORTCUT_NAME),
    path.join(programs, "Gaurav POS Hub", SHORTCUT_NAME)
  ];
  for (const shortcut of shortcuts) {
    if (!existsSync(shortcut)) continue;
    try {
      const current = shell.readShortcutLink(shortcut);
      if (path.resolve(current.target).toLowerCase() !== path.resolve(process.execPath).toLowerCase()) continue;
      if (!shell.writeShortcutLink(shortcut, "update", { target: current.target, icon: iconPath, iconIndex: 0 })) {
        console.warn("Unable to refresh restaurant shortcut icon", shortcut);
      }
    } catch (error) {
      console.warn("Unable to refresh restaurant shortcut icon", error);
    }
  }
}

export async function applyRestaurantDesktopBranding(window: BrowserWindow, branding: RestaurantBranding): Promise<void> {
  const name = branding.restaurantName.trim() || "Restaurant";
  const png = await restaurantIcon(branding);
  if (window.isDestroyed()) return;
  const icon = nativeImage.createFromBuffer(png);
  window.setTitle(name);
  if (process.platform === "darwin") app.dock?.setIcon(icon);
  else window.setIcon(icon);

  if (process.platform !== "win32" || !app.isPackaged) return;
  const iconDirectory = path.join(app.getPath("userData"), "restaurant-icons");
  const iconPath = path.join(iconDirectory, `${createHash("sha256").update(png).digest("hex")}.ico`);
  await mkdir(iconDirectory, { recursive: true });
  if (!existsSync(iconPath)) await writeFile(iconPath, pngIconFile(png));
  if (window.isDestroyed()) return;
  window.setAppDetails({ appId: WINDOWS_APP_ID, appIconPath: iconPath, appIconIndex: 0, relaunchDisplayName: name });
  updateWindowsShortcuts(iconPath);
}
