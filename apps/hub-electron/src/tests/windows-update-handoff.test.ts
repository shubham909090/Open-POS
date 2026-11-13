import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UPDATE_FAILURE_FILE, powershellCommand, psQuote, startProcessCommand, writeWindowsHandoffScript, writeWindowsInstallerHandoff } from "../update/windows-update-handoff.js";

describe("windows update handoff", () => {
  it("launches PowerShell directly with a file argument and waits before starting the installer", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-handoff O'Hara & "));
    try {
      const scriptPath = join(root, "Install Gaurav POS Update.ps1");
      const plan = writeWindowsInstallerHandoff({
        scriptPath,
        logPath: join(root, "install-handoff.log"),
        appExecutablePath: "C:\\Program Files\\Gaurav POS Hub\\Gaurav POS Hub.exe",
        parentPid: 12345,
        installer: { filePath: "C:\\Temp\\O'Hara & %data%\\Jos\u00e9\\setup.exe", args: ["--updated", "/S", "--force-run"] }
      });
      expect(plan).toMatchObject({ filePath: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath] });
      const script = readFileSync(scriptPath, "utf8");
      expect(script.charCodeAt(0)).toBe(0xfeff);
      expect(script).toContain("Jos\u00e9");
      expect(script).toContain("O''Hara & %data%");
      expect(script).toContain("$_.Path -eq");
      expect(script).toContain("Get-Process -Name 'Gaurav POS Hub'");
      expect(script).toContain("-PassThru -ErrorAction Stop");
      expect(script).toContain("$installer.WaitForExit()");
      expect(script).not.toContain("-Wait -PassThru");
      expect(script).toContain("$installer.ExitCode -ne 0");
      expect(script).toContain("Start-Transcript");
      expect(script.indexOf("Wait-Process")).toBeLessThan(script.indexOf("Start-Process"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records failures independently of the transcript and reopens only an authorized, stopped Hub", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-recovery O'Hara & "));
    try {
      const attemptDir = join(root, "handoff-attempt");
      const scriptPath = join(attemptDir, "Install Update.ps1");
      const appPath = "C:\\Program Files\\Gaurav POS Hub\\Gaurav POS Hub.exe";
      const plan = writeWindowsInstallerHandoff({
        scriptPath,
        logPath: join(root, "install-handoff.log"),
        appExecutablePath: appPath,
        parentPid: 12345,
        installer: { filePath: "C:\\Temp\\setup.exe", args: ["--updated", "/S", "--force-run"] }
      });
      expect(plan.handoff).toEqual({ readyPath: join(attemptDir, "ready"), decisionPath: join(attemptDir, "decision"), startupLogPath: join(attemptDir, "startup.log") });
      const script = readFileSync(scriptPath, "utf8");
      expect(UPDATE_FAILURE_FILE).toBe("last-update-error.json");
      expect(script).toContain(`[System.IO.File]::AppendAllText(${psQuote(join(attemptDir, "startup.log"))}`);
      expect(script.indexOf('Write-HandoffLog "PowerShell helper started, PID $PID"')).toBeLessThan(script.indexOf("Start-Transcript"));
      expect(script).toContain("Write-HandoffLog 'Shutdown authorized; waiting for Hub to exit.'");
      expect(script).toContain('Write-HandoffLog "Installer process: $($installer.Id)"');
      expect(script).toContain("message = $failureMessage; occurredAt = [DateTime]::UtcNow.ToString('o')");
      expect(script).toContain(`[System.IO.File]::WriteAllText(${psQuote(join(root, UPDATE_FAILURE_FILE))}, $failure)`);
      expect(script).not.toContain(psQuote(join(attemptDir, UPDATE_FAILURE_FILE)));
      const failureHandler = script.slice(script.indexOf("  $failureMessage = $_.Exception.Message"));
      expect(failureHandler).toContain("$exitCode = 1");
      expect(failureHandler).toContain('Write-HandoffLog ("Update failed: " + $failureMessage)');
      expect(failureHandler).toContain('catch { Write-HandoffLog ("Could not persist update failure: " + $_.Exception.Message) }');
      expect(failureHandler).toContain("if ($decision -eq 'go') {");
      expect(failureHandler).toContain(`Where-Object { $_.Path -eq ${psQuote(appPath)} -or -not $_.Path }`);
      expect(failureHandler).toContain(`if ($runningHub.Count -eq 0 -and (Test-Path -LiteralPath ${psQuote(appPath)} -PathType Leaf)) {`);
      expect(failureHandler).toContain(`Start-Process -FilePath ${psQuote(appPath)} -ErrorAction Stop | Out-Null`);
      expect(failureHandler.indexOf("if ($decision -eq 'go')")).toBeLessThan(failureHandler.indexOf("Start-Process"));
      expect(failureHandler).toContain('catch { Write-HandoffLog ("Could not reopen Hub: " + $_.Exception.Message) }');
      expect(failureHandler).toContain('try { Stop-Transcript } catch { Write-HandoffLog ("Could not stop transcript: " + $_.Exception.Message) }');
      expect(script.trimEnd()).toMatch(/exit \$exitCode$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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
