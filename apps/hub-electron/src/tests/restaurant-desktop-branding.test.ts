import { afterEach, expect, it, vi } from "vitest";
import { PNG } from "pngjs";

const desktop = vi.hoisted(() => ({
  getPath: vi.fn((name: string) => `/pos/${name}`),
  readShortcutLink: vi.fn(),
  writeShortcutLink: vi.fn(() => true),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  existsSync: vi.fn(() => true)
}));
vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: desktop.getPath },
  nativeImage: { createFromBuffer: (buffer: Buffer) => buffer },
  shell: { readShortcutLink: desktop.readShortcutLink, writeShortcutLink: desktop.writeShortcutLink }
}));
vi.mock("node:fs", () => ({ existsSync: desktop.existsSync }));
vi.mock("node:fs/promises", () => ({ mkdir: desktop.mkdir, writeFile: desktop.writeFile }));

import { applyRestaurantDesktopBranding, pngIconFile } from "../restaurant-desktop-branding.js";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("encodes a Windows ICO with the complete PNG payload", () => {
  const png = Buffer.from("test png");
  const ico = pngIconFile(png);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(1);
  expect(ico.readUInt32LE(14)).toBe(png.length);
  expect(ico.readUInt32LE(18)).toBe(22);
  expect(ico.subarray(22)).toEqual(png);
});

it("brands the window and updates only shortcuts targeting this executable", async () => {
  vi.stubGlobal("process", { ...process, platform: "win32", execPath: "/pos/Hub.exe" });
  desktop.readShortcutLink.mockReturnValueOnce({ target: "/pos/Hub.exe" })
    .mockReturnValueOnce({ target: "/another/Hub.exe" })
    .mockReturnValueOnce({ target: "/pos/Hub.exe" })
    .mockReturnValueOnce({ target: "/pos/Hub.exe" });
  const window = { isDestroyed: () => false, setTitle: vi.fn(), setIcon: vi.fn(), setAppDetails: vi.fn() };
  const logo = new PNG({ width: 4, height: 4 });
  logo.data.fill(255);
  const dataUrl = `data:image/png;base64,${PNG.sync.write(logo).toString("base64")}`;
  await applyRestaurantDesktopBranding(window as never, { restaurantName: "Saffron", logoImageDataUrl: dataUrl, updatedAt: null });
  expect(window.setTitle).toHaveBeenCalledWith("Saffron");
  expect(window.setIcon).toHaveBeenCalledOnce();
  expect(window.setAppDetails).toHaveBeenCalledWith(expect.objectContaining({ appId: "in.gaurav.pos.hub", relaunchDisplayName: "Saffron" }));
  expect(desktop.writeShortcutLink).toHaveBeenCalledTimes(3);
  expect(desktop.writeShortcutLink).toHaveBeenCalledWith(expect.any(String), "update", { target: "/pos/Hub.exe", icon: expect.stringMatching(/\.ico$/), iconIndex: 0 });
});
