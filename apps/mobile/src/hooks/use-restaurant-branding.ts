import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RESTAURANT_LOGO_MAX_IMAGE_BYTES, restaurantBrandingSchema, type RestaurantBranding } from "@gaurav-pos/shared";

import type { HubClient } from "../lib/hub-client";
import { pickImageDataUrl } from "./use-payment-qr";

const BRANDING_CACHE_KEY = "gaurav-pos:restaurant-branding";
// Skip caching anything unexpectedly large after the hub normalizes the image.
const BRANDING_CACHE_MAX_LENGTH = 900_000;

export type RestaurantBrandingDraft = {
  restaurantName: string;
  /** undefined keeps the saved logo, null removes it, a data URL replaces it. */
  imageDataUrl?: string | null;
};

/**
 * Shared restaurant name and logo for every paired role. The last copy is kept on the phone so
 * the shell stays branded while the hub is offline.
 */
export function useRestaurantBranding({ client, hubUrl, online, deviceName }: { client: HubClient; hubUrl: string; online: boolean; deviceName: string }) {
  const [branding, setBranding] = useState<RestaurantBranding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const currentClient = useRef(client);
  currentClient.current = client;
  const cacheKey = `${BRANDING_CACHE_KEY}:${hubUrl.trim().replace(/\/+$/, "")}`;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    setBranding(null);
    setBusy(false);
    setError("");
    setNotice("");
    void AsyncStorage.getItem(cacheKey).then((stored) => {
      if (!stored || !mounted.current || !active) return;
      try {
        const parsed = restaurantBrandingSchema.safeParse(JSON.parse(stored));
        if (parsed.success) setBranding((current) => current ?? parsed.data);
      } catch { /* A damaged cache only means the default mark shows until the hub answers. */ }
    }).catch(() => { /* The default mark remains available if local storage fails. */ });
    return () => { active = false; mounted.current = false; };
  }, [cacheKey]);

  const apply = useCallback((next: RestaurantBranding) => {
    setBranding(next);
    const serialised = JSON.stringify(next);
    const write = serialised.length <= BRANDING_CACHE_MAX_LENGTH
      ? AsyncStorage.setItem(cacheKey, serialised)
      : AsyncStorage.removeItem(cacheKey);
    void write.catch(() => { /* Branding still works without an offline cache. */ });
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    try {
      const result = await client.restaurantBranding();
      if (mounted.current && currentClient.current === client) apply(result.branding);
    } catch {
      // Older hubs do not have branding yet; the shell keeps its cached or default mark.
    }
  }, [apply, client]);

  useEffect(() => {
    if (!online) return;
    void refresh();
    return client.subscribeRealtime((event) => {
      if (event.type === "restaurant_branding.updated") {
        setNotice("");
        void refresh();
      }
    });
  }, [client, online, refresh]);

  async function pickLogo(): Promise<string | null> {
    setError("");
    setNotice("");
    try {
      return await pickImageDataUrl(RESTAURANT_LOGO_MAX_IMAGE_BYTES, "logo");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not open the photo picker.");
      return null;
    }
  }

  async function save(draft: RestaurantBrandingDraft, pin: string): Promise<boolean> {
    if (!online) {
      setError("Connect to the hub before changing the restaurant name or logo.");
      return false;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const removingOnly = draft.imageDataUrl === null && draft.restaurantName.trim() === (branding?.restaurantName ?? "");
    const approval = { masterApproval: {
      pin,
      reason: removingOnly ? "Remove restaurant logo" : "Update restaurant name and logo",
      approvedBy: deviceName || "Master PIN holder"
    } };
    try {
      const expectedUpdatedAt = branding?.updatedAt ?? null;
      const result = removingOnly
        ? await client.removeRestaurantLogo(approval, expectedUpdatedAt)
        : await client.updateRestaurantBranding({ restaurantName: draft.restaurantName.trim(), imageDataUrl: draft.imageDataUrl, expectedUpdatedAt }, approval);
      if (!mounted.current || currentClient.current !== client) return true;
      apply(result.branding);
      setNotice("Restaurant branding saved. Every paired device updates automatically.");
      return true;
    } catch (failure) {
      if (mounted.current && currentClient.current === client) setError(failure instanceof Error ? failure.message : "Could not update the restaurant branding.");
      return false;
    } finally {
      if (mounted.current && currentClient.current === client) setBusy(false);
    }
  }

  return { branding, busy, error, notice, setError, refresh, pickLogo, save };
}
