import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, getDeviceToken, getHubUrl, loadDraft, saveDraft, setDeviceToken, setHubUrl } from "../lib/draft-store";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    })
  }
}));

describe("mobile draft and session storage", () => {
  beforeEach(() => {
    storage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T06:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to the beginner-friendly hub URL and saves a clean pasted LAN URL", async () => {
    await expect(getHubUrl()).resolves.toBe("http://192.168.1.10:3737");

    await setHubUrl("  http://192.168.1.20:3737///  ");

    await expect(getHubUrl()).resolves.toBe("http://192.168.1.20:3737");
  });

  it("trims the paired device token before saving", async () => {
    await expect(getDeviceToken()).resolves.toBe("");

    await setDeviceToken("  captain-token  ");

    await expect(getDeviceToken()).resolves.toBe("captain-token");
  });

  it("saves, loads, and clears table drafts by table id", async () => {
    await saveDraft({
      tableId: "table-t1",
      pax: 3,
      items: [{ menuItemId: "item-paneer-tikka", quantity: 2 }],
      updatedAt: "old-client-time"
    });

    await expect(loadDraft("table-t1")).resolves.toEqual({
      tableId: "table-t1",
      pax: 3,
      items: [{ menuItemId: "item-paneer-tikka", quantity: 2 }],
      updatedAt: "2026-05-15T06:00:00.000Z"
    });

    await clearDraft("table-t1");

    await expect(loadDraft("table-t1")).resolves.toBeNull();
  });
});
