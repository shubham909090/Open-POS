import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { powershellCommand, startProcessCommand, writeWindowsHandoffScript } from "../update/windows-update-handoff.js";

describe("windows update handoff", () => {
  it("encodes PowerShell commands so batch metacharacters in paths cannot expand", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-windows-handoff-"));
    const weirdInstallerPath = "C:\\Temp\\%BAD% & O'Hara\\Gaurav POS Hub Setup 0.2.0.exe";
    try {
      const scriptPath = writeWindowsHandoffScript({
        scriptPath: join(root, "Install Gaurav POS Update.cmd"),
        waitMessage: "Waiting for Gaurav POS Hub...",
        afterWaitMilliseconds: 500,
        afterWaitLines: [
          powershellCommand(startProcessCommand({
            filePath: weirdInstallerPath,
            args: ["--updated path", "O'Hara", "%BAD%&"]
          }))
        ]
      });
      const script = readFileSync(scriptPath, "utf8");
      const decodedCommands = decodePowerShellCommands(script);

      expect(script).toContain("-EncodedCommand");
      expect(script).not.toContain(weirdInstallerPath);
      expect(decodedCommands.some((command) => command.includes("Wait-Process -Id $env:GPOS_PARENT_PID"))).toBe(true);
      expect(decodedCommands.some((command) => command.includes("Start-Process -FilePath 'C:\\Temp\\%BAD% & O''Hara\\Gaurav POS Hub Setup 0.2.0.exe'"))).toBe(true);
      expect(decodedCommands.some((command) => command.includes("-ArgumentList @('--updated path','O''Hara','%BAD%&')"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function decodePowerShellCommands(script: string): string[] {
  return [...script.matchAll(/-EncodedCommand\s+([A-Za-z0-9+/=]+)/g)].map((match) => Buffer.from(match[1] ?? "", "base64").toString("utf16le"));
}
