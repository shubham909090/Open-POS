import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = join(__dirname, "..", "renderer");

describe("Electron renderer focus safety", () => {
  it("does not use blocking native browser alert/confirm dialogs", () => {
    const files = [
      join(rendererRoot, "App.tsx"),
      join(rendererRoot, "components", "orders", "table-workspace.tsx"),
      join(rendererRoot, "components", "advanced", "advanced-view.tsx"),
      join(rendererRoot, "components", "setup", "setup-view.tsx"),
      join(rendererRoot, "components", "alcohol", "alcohol-items-panel.tsx")
    ];

    const forbidden = /\b(?:window\.)?(?:alert|confirm)\s*\(/;
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return source
        .split("\n")
        .map((line, index) => ({ file, line: index + 1, text: line }))
        .filter((entry) => forbidden.test(entry.text));
    });

    expect(offenders).toEqual([]);
  });
});
