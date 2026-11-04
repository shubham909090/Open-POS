import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { updateHandoffTiming } from "../config/update-handoff.js";
import { launchUpdateProcess } from "../update/launch-update-process.js";
import type { UpdateLaunchPlan } from "../update/windows-update-handoff.js";

function fixture(script: (paths: NonNullable<UpdateLaunchPlan["handoff"]>) => string) {
  const root = mkdtempSync(join(tmpdir(), "gpos-launch-"));
  const handoff = { readyPath: join(root, "ready"), decisionPath: join(root, "decision"), startupLogPath: join(root, "startup.log") };
  const scriptPath = join(root, "helper.cjs");
  writeFileSync(scriptPath, script(handoff));
  return { root, plan: { filePath: process.execPath, args: [scriptPath], handoff }, close: () => rmSync(root, { recursive: true, force: true }) };
}

describe("real update process launch", () => {
  it("rejects a helper that spawns successfully but exits without executing its handoff", async () => {
    const test = fixture(() => "process.exit(0)");
    try {
      await expect(launchUpdateProcess(test.plan, test.root)).rejects.toThrow("Hub has been kept open");
      expect(readFileSync(test.plan.handoff.decisionPath, "utf8")).toBe("cancel");
      expect(readFileSync(test.plan.handoff.startupLogPath, "utf8")).toContain("exited before becoming ready (code 0");
    } finally { test.close(); }
  });

  it("authorizes shutdown only after the real child reports readiness", async () => {
    const test = fixture(paths => `const fs = require('node:fs');
      if (fs.existsSync(${JSON.stringify(paths.decisionPath)})) process.exit(2);
      fs.writeFileSync(${JSON.stringify(paths.readyPath)}, 'ready');
      const poll = setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(paths.decisionPath)})) return;
        clearInterval(poll);
        process.exit(fs.readFileSync(${JSON.stringify(paths.decisionPath)}, 'utf8') === 'go' ? 0 : 3);
      }, 5);`);
    try {
      await launchUpdateProcess(test.plan, test.root);
      expect(readFileSync(test.plan.handoff.decisionPath, "utf8")).toBe("go");
      // Let the independent child release its file handles before fixture cleanup.
      await delay(100);
    } finally { test.close(); }
  });

  it("persists cancellation on timeout so a delayed helper cannot install later", async () => {
    const test = fixture(() => "setInterval(() => {}, 1000)");
    try {
      await expect(launchUpdateProcess(test.plan, test.root, {
        ...updateHandoffTiming, startupTimeoutMs: 50, pollIntervalMs: 5
      })).rejects.toThrow("did not become ready");
      expect(existsSync(test.plan.handoff.readyPath)).toBe(false);
      expect(readFileSync(test.plan.handoff.decisionPath, "utf8")).toBe("cancel");
    } finally { test.close(); }
  });

  it("cancels and reports a process that cannot spawn", async () => {
    const test = fixture(() => "");
    test.plan.filePath = join(test.root, "missing-executable");
    try {
      await expect(launchUpdateProcess(test.plan, test.root)).rejects.toThrow("Hub has been kept open");
      expect(readFileSync(test.plan.handoff.decisionPath, "utf8")).toBe("cancel");
    } finally { test.close(); }
  });
});
