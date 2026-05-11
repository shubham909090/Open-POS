import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadHubConfig } from "../config.js";

describe("hub runtime config", () => {
  it("loads packaged Windows hub.env files and lets process env override them", () => {
    const root = join(tmpdir(), `gaurav-pos-config-${Date.now()}`);
    const configPath = join(root, "hub.env");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      configPath,
      [
        "HUB_HOST=0.0.0.0",
        "HUB_PORT=3737",
        "HUB_PUBLIC_URL=http://192.168.1.20:3737",
        "HUB_DATABASE_PATH=C:\\ProgramData\\Gaurav POS Hub\\data\\hub.sqlite",
        "HUB_PRINTER_DRY_RUN=false",
        "HUB_ADMIN_TOKEN=file-token"
      ].join("\n")
    );

    const config = loadHubConfig({
      HUB_CONFIG_FILE: configPath,
      HUB_PORT: "4747"
    });

    expect(config).toMatchObject({
      host: "0.0.0.0",
      port: 4747,
      publicUrl: "http://192.168.1.20:3737",
      databasePath: "C:\\ProgramData\\Gaurav POS Hub\\data\\hub.sqlite",
      printerDryRun: false,
      adminToken: "file-token"
    });

    rmSync(root, { recursive: true, force: true });
  });
});
