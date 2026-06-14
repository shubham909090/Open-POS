import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Hub update release config", () => {
  it("builds one-click Windows releases with electron-updater metadata", () => {
    const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      build?: {
        publish?: Array<Record<string, string>>;
        nsis?: Record<string, unknown>;
      };
    };

    expect(packageJson.dependencies?.["electron-updater"]).toBeTruthy();
    expect(packageJson.build?.publish).toContainEqual({
      provider: "github",
      owner: "shubham909090",
      repo: "Open-POS",
      releaseType: "release"
    });
    expect(packageJson.build?.nsis).toMatchObject({
      oneClick: true,
      perMachine: false,
      allowToChangeInstallationDirectory: false
    });
  });

  it("loads electron-updater through a CommonJS-safe import in packaged ESM", () => {
    const updaterPath = fileURLToPath(new URL("../update/electron-online-updater.ts", import.meta.url));
    const source = readFileSync(updaterPath, "utf8");

    expect(source).not.toMatch(/import\s*\{\s*autoUpdater\s*\}\s*from\s*["']electron-updater["']/);
    expect(source).toMatch(/import\s+\w+\s+from\s+["']electron-updater["']/);
    expect(source).toMatch(/const\s*\{\s*autoUpdater\s*\}\s*=\s*\w+/);
  });
});
