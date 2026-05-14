export type HubCommandCursor = { createdAt: string; commandId: string };

export type HubCommandCursorTarget = { createdAt: string; commandId: string };

export function parseHubCommandCursor(cursor: string | undefined): HubCommandCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as Partial<HubCommandCursor>;
    if (typeof parsed.createdAt === "string" && typeof parsed.commandId === "string") {
      return { createdAt: parsed.createdAt, commandId: parsed.commandId };
    }
  } catch {
    // Legacy cursors were plain createdAt strings. Keep them readable as opaque input.
  }
  return { createdAt: cursor, commandId: "" };
}

export function serializeHubCommandCursor(command: HubCommandCursorTarget): string {
  return JSON.stringify({ createdAt: command.createdAt, commandId: command.commandId });
}

export function compareHubCommandPosition(a: HubCommandCursorTarget, b: HubCommandCursorTarget): number {
  const createdAtCompare = a.createdAt.localeCompare(b.createdAt);
  if (createdAtCompare !== 0) return createdAtCompare;
  return a.commandId.localeCompare(b.commandId);
}

export function isHubCommandAfterCursor(command: HubCommandCursorTarget, cursor: HubCommandCursor | null): boolean {
  if (!cursor) return true;
  return compareHubCommandPosition(command, cursor) > 0;
}
