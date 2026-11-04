import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { updateHandoffTiming } from "../config/update-handoff.js";
import { psQuote, startProcessCommand, type UpdateLaunchPlan } from "./windows-update-handoff.js";

export async function launchUpdateProcess(
  plan: UpdateLaunchPlan,
  cwd: string,
  timing = updateHandoffTiming
): Promise<void> {
  const isBatch = extname(plan.filePath).toLowerCase() === ".cmd";
  let command = isBatch ? "powershell.exe" : plan.filePath;
  let args = isBatch
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(startProcessCommand(plan), "utf16le").toString("base64")]
    : plan.args;
  const handoff = plan.handoff;
  const separateConsole = process.platform === "win32" && !!handoff && command.toLowerCase() === "powershell.exe";
  if (separateConsole) {
    // cmd START allocates a console that survives Electron. DETACHED_PROCESS
    // makes PowerShell exit 0 before -File; an inherited console dies with Hub.
    // Only fixed switches and base64 cross cmd's parser; paths stay in PowerShell.
    const scriptPath = plan.args.at(-1);
    if (!scriptPath) throw new Error("Windows update helper script is missing.");
    const encoded = Buffer.from(`& ${psQuote(scriptPath)}`, "utf16le").toString("base64");
    command = "cmd.exe";
    args = ["/d", "/s", "/c", `start "" /min powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`];
  }
  const log = handoff && !separateConsole ? openSync(handoff.startupLogPath, "a") : undefined;
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    stdio: log === undefined ? "ignore" : ["ignore", log, log],
    cwd,
    shell: false,
    windowsVerbatimArguments: separateConsole
  });
  let launchError: Error | undefined;
  child.on("error", (error) => { launchError = error; });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    if (handoff) {
      appendFileSync(handoff.startupLogPath, `${new Date().toISOString()} helper started, PID ${child.pid}\n`);
      const deadline = Date.now() + timing.startupTimeoutMs;
      while (!existsSync(handoff.readyPath)) {
        if (launchError) throw launchError;
        if ((!separateConsole && child.exitCode !== null) || (child.exitCode !== null && child.exitCode !== 0) || child.signalCode !== null) {
          throw new Error(`Update helper exited before becoming ready (code ${child.exitCode}, signal ${child.signalCode}).`);
        }
        if (Date.now() >= deadline) throw new Error("Update helper did not become ready in time.");
        await delay(timing.pollIntervalMs);
      }
      appendFileSync(handoff.startupLogPath, `${new Date().toISOString()} helper ready; shutdown authorized\n`);
      writeFileSync(handoff.decisionPath, "go", { flag: "wx" });
    }
    child.unref();
  } catch (error) {
    if (handoff) {
      // Keep cancellation on disk: even a delayed helper must never install later.
      if (!existsSync(handoff.decisionPath)) writeFileSync(handoff.decisionPath, "cancel", { flag: "wx" });
      appendFileSync(handoff.startupLogPath, `${new Date().toISOString()} ${String(error)}\n`);
    }
    child.kill();
    throw new Error(`Could not start the update. Hub has been kept open. ${error instanceof Error ? error.message : String(error)}${handoff ? ` See ${handoff.startupLogPath}` : ""}`);
  } finally {
    if (log !== undefined) closeSync(log);
  }
}
