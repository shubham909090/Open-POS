import { beforeEach, expect, it, vi } from "vitest";
import type { RestaurantBranding } from "@gaurav-pos/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readRestaurantBrandingCache, writeRestaurantBrandingCache } from "../lib/restaurant-branding-cache";

const { rows } = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: vi.fn(async (key: string) => rows.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
  multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, rows.get(key) ?? null])),
  multiSet: vi.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => rows.set(key, value)); }),
  multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => rows.delete(key)); })
} }));
beforeEach(() => { rows.clear(); vi.clearAllMocks(); });
const key = "branding:test-hub";
const branding: RestaurantBranding = { restaurantName: "Saffron Table", logoImageDataUrl: null, updatedAt: "2026-11-09T10:00:00.000Z" };

it("keeps a full-quality logo larger than the old cache limit across offline reloads", async () => {
  const large = { ...branding, logoImageDataUrl: `data:image/png;base64,${"A".repeat(2_000_000)}` };
  await writeRestaurantBrandingCache(key, large);
  expect([...rows.values()].every((row) => row.length < 500_000)).toBe(true);
  expect(await readRestaurantBrandingCache(key)).toEqual(large);
});

it("reads the previous single-row cache and replaces its logo without stale parts", async () => {
  rows.set(key, JSON.stringify({ ...branding, logoImageDataUrl: "data:image/png;base64,AAAA" }));
  expect((await readRestaurantBrandingCache(key))?.logoImageDataUrl).toBe("data:image/png;base64,AAAA");
  await writeRestaurantBrandingCache(key, { ...branding, logoImageDataUrl: `data:image/png;base64,${"B".repeat(600_000)}` });
  await writeRestaurantBrandingCache(key, branding);
  expect(await readRestaurantBrandingCache(key)).toEqual(branding);
  expect([...rows.keys()]).toEqual([key]);
});

it("keeps the restaurant name if an image part is missing", async () => {
  await writeRestaurantBrandingCache(key, { ...branding, logoImageDataUrl: `data:image/png;base64,${"C".repeat(600_000)}` });
  const imageKey = [...rows.keys()].find((entry) => entry !== key)!;
  rows.delete(imageKey);
  expect(await readRestaurantBrandingCache(key)).toEqual(branding);
});

it("removes new chunks if publishing their manifest fails", async () => {
  await writeRestaurantBrandingCache(key, branding);
  vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("Storage full"));
  await expect(writeRestaurantBrandingCache(key, { ...branding, logoImageDataUrl: `data:image/png;base64,${"A".repeat(600_000)}` })).rejects.toThrow("Storage full");
  expect([...rows.keys()]).toEqual([key]);
  expect(await readRestaurantBrandingCache(key)).toEqual(branding);
});

it("does not replace a valid cache if storing a new image fails", async () => {
  await writeRestaurantBrandingCache(key, branding);
  vi.mocked(AsyncStorage.multiSet).mockRejectedValueOnce(new Error("Storage full"));
  await expect(writeRestaurantBrandingCache(key, { ...branding, logoImageDataUrl: "data:image/png;base64,AAAA" })).rejects.toThrow("Storage full");
  expect(await readRestaurantBrandingCache(key)).toEqual(branding);
  expect([...rows.keys()]).toEqual([key]);
});


it("keeps receipt artwork and the cropped app icon as separate offline images", async () => {
  const cropped = {
    ...branding,
    logoImageDataUrl: `data:image/png;base64,${"S".repeat(1_000_000)}`,
    iconImageDataUrl: `data:image/png;base64,${"I".repeat(700_000)}`,
    iconCrop: { x: 0.25, y: 0, width: 0.5, height: 1 }
  };
  await writeRestaurantBrandingCache(key, cropped);
  expect([...rows.values()].every((row) => row.length < 500_000)).toBe(true);
  expect(await readRestaurantBrandingCache(key)).toEqual(cropped);
  await writeRestaurantBrandingCache(key, branding);
  expect([...rows.keys()]).toEqual([key]);
});
