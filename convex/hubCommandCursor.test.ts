import { describe, expect, it } from "vitest";
import {
  compareHubCommandPosition,
  isHubCommandAfterCursor,
  parseHubCommandCursor,
  serializeHubCommandCursor,
  type HubCommandCursorTarget
} from "./hubCommandCursor";

describe("hub command cursor", () => {
  it("delivers more than 100 commands that share the same timestamp", () => {
    const createdAt = "2026-05-09T12:00:00.000Z";
    const commands: HubCommandCursorTarget[] = Array.from({ length: 125 }, (_, index) => ({
      createdAt,
      commandId: `cmd-${String(index).padStart(3, "0")}`
    })).sort(compareHubCommandPosition);

    let cursor: string | undefined;
    const delivered: string[] = [];

    for (let page = 0; page < 3; page += 1) {
      const parsedCursor = parseHubCommandCursor(cursor);
      const batch = commands.filter((command) => isHubCommandAfterCursor(command, parsedCursor)).slice(0, 100);
      if (batch.length === 0) break;
      delivered.push(...batch.map((command) => command.commandId));
      cursor = serializeHubCommandCursor(batch.at(-1)!);
    }

    expect(delivered).toHaveLength(125);
    expect(new Set(delivered)).toHaveLength(125);
    expect(delivered.at(0)).toBe("cmd-000");
    expect(delivered.at(-1)).toBe("cmd-124");
  });
});
