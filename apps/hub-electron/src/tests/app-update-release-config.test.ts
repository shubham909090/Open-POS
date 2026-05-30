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
});
