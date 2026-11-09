import AsyncStorage from "@react-native-async-storage/async-storage";
import { restaurantBrandingSchema, type RestaurantBranding } from "@gaurav-pos/shared";

// Android's storage cursor limits one row. Keep full-quality images in smaller rows.
const LOGO_CACHE_CHUNK_LENGTH = 450_000;
function cachedLogoKeys(key: string, value: unknown): string[] {
  return Array.isArray(value) && value.length <= 8 && value.every((part) => typeof part === "string" && part.startsWith(`${key}:logo:`)) ? value : [];
}

async function readImage(keys: string[]): Promise<string | null> {
  if (!keys.length) return null;
  const parts = await AsyncStorage.multiGet(keys);
  return parts.every(([, value]) => value !== null) ? parts.map(([, value]) => value).join("") : null;
}

export async function readRestaurantBrandingCache(key: string): Promise<RestaurantBranding | null> {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;
  const record = JSON.parse(stored);
  const cached = restaurantBrandingSchema.parse(record);
  if (record.logoCacheKeys !== undefined) cached.logoImageDataUrl = await readImage(cachedLogoKeys(key, record.logoCacheKeys));
  if (record.iconCacheKeys !== undefined) cached.iconImageDataUrl = await readImage(cachedLogoKeys(key, record.iconCacheKeys));
  return restaurantBrandingSchema.parse(cached);
}

export async function writeRestaurantBrandingCache(key: string, branding: RestaurantBranding): Promise<void> {
  const stored = await AsyncStorage.getItem(key);
  let previousKeys: string[] = [];
  if (stored) {
    try {
      const previous = JSON.parse(stored);
      previousKeys = [...cachedLogoKeys(key, previous.logoCacheKeys), ...cachedLogoKeys(key, previous.iconCacheKeys)];
    } catch { /* Replace an unreadable local cache with the latest hub identity. */ }
  }
  const parts: [string, string][] = [];
  const revision = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function imageParts(image: string | null | undefined): string[] {
    const keys: string[] = [];
    for (let offset = 0; image && offset < image.length; offset += LOGO_CACHE_CHUNK_LENGTH) {
      const partKey = `${key}:logo:${revision}:${parts.length}`;
      keys.push(partKey);
      parts.push([partKey, image.slice(offset, offset + LOGO_CACHE_CHUNK_LENGTH)]);
    }
    return keys;
  }
  const logoCacheKeys = imageParts(branding.logoImageDataUrl);
  const iconCacheKeys = branding.iconImageDataUrl === undefined ? undefined : imageParts(branding.iconImageDataUrl);
  try {
    if (parts.length) await AsyncStorage.multiSet(parts);
    // Publish only after both images are stored, so readers cannot mix revisions.
    await AsyncStorage.setItem(key, JSON.stringify({ ...branding, logoImageDataUrl: null, iconImageDataUrl: branding.iconImageDataUrl === undefined ? undefined : null, logoCacheKeys, iconCacheKeys }));
  } catch (error) {
    await AsyncStorage.multiRemove(parts.map(([partKey]) => partKey)).catch(() => {});
    throw error;
  }
  if (previousKeys.length) await AsyncStorage.multiRemove(previousKeys);
}
