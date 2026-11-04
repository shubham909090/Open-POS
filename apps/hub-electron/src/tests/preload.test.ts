import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("exposes the packaged CommonJS picker and native focus bridge", async () => {
  const exposeInMainWorld = vi.fn();
  const invoke = vi.fn().mockResolvedValue({ ok: true });
  const source = readFileSync(new URL("../../preload.cjs", import.meta.url), "utf8");
  runInNewContext(source, {
    require: (name: string) => {
      expect(name).toBe("electron");
      return { contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } };
    }
  });
  expect(exposeInMainWorld).toHaveBeenCalledWith("gauravPos", {
    chooseUpdatePackage: expect.any(Function),
    repairFocus: expect.any(Function)
  });
  const bridge = exposeInMainWorld.mock.calls[0]?.[1];
  await bridge.chooseUpdatePackage();
  expect(invoke).toHaveBeenLastCalledWith("updates:choose-package", "update");
  await bridge.chooseUpdatePackage("installer");
  expect(invoke).toHaveBeenLastCalledWith("updates:choose-package", "installer");
  await expect(bridge.repairFocus()).resolves.toEqual({ ok: true });
  expect(invoke).toHaveBeenLastCalledWith("app:repair-focus");
});
