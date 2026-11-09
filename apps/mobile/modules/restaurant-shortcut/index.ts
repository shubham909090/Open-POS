import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type RestaurantShortcutInput = {
  name: string;
  logoImageDataUrl: string | null;
};

export type RestaurantShortcutResult = "requested" | "updated" | "unsupported";

export type RestaurantIconCrop = { x: number; y: number; width: number; height: number };
export type RestaurantIconCropResult = { crop: RestaurantIconCrop; previewImageDataUrl: string };

type RestaurantShortcutModule = {
  isSupported(): boolean;
  request(name: string, logoImageDataUrl: string | null): Promise<RestaurantShortcutResult>;
  update(name: string, logoImageDataUrl: string | null): Promise<boolean>;
  cropIcon?(sourceDataUrl: string, initialCrop: RestaurantIconCrop | null): Promise<RestaurantIconCropResult | null>;
};

function nativeModule(): RestaurantShortcutModule | null {
  return Platform.OS === "android"
    ? requireOptionalNativeModule<RestaurantShortcutModule>("RestaurantShortcut")
    : null;
}

export function isRestaurantShortcutSupported(): boolean {
  return nativeModule()?.isSupported() ?? false;
}

/** A request opens Android's confirmation. It does not confirm installation. */
export async function requestRestaurantShortcut(input: RestaurantShortcutInput): Promise<RestaurantShortcutResult> {
  const module = nativeModule();
  return module ? module.request(input.name, input.logoImageDataUrl) : "unsupported";
}

/** Refresh only an existing pinned shortcut after restaurant branding changes. */
export async function updateRestaurantShortcut(input: RestaurantShortcutInput): Promise<boolean> {
  const module = nativeModule();
  return module ? module.update(input.name, input.logoImageDataUrl) : false;
}

export function isRestaurantIconCropSupported(): boolean {
  return typeof nativeModule()?.cropIcon === "function";
}

/** Crop coordinates reference the oriented original; the source image is preserved. */
export async function cropRestaurantIcon(
  sourceDataUrl: string,
  initialCrop?: RestaurantIconCrop | null,
): Promise<RestaurantIconCropResult | null> {
  const module = nativeModule();
  if (!module?.cropIcon) throw new Error("Rebuild the Android app to adjust its icon.");
  return module.cropIcon(sourceDataUrl, initialCrop ?? null);
}
