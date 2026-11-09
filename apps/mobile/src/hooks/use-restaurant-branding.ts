import { useCallback, useEffect, useRef, useState } from "react";
import { RESTAURANT_LOGO_MAX_IMAGE_BYTES, type RestaurantBranding, type UpdateRestaurantBrandingInput } from "@gaurav-pos/shared";

import type { HubClient } from "../lib/hub-client";
import { pickImageDataUrl } from "./use-payment-qr";
import { readRestaurantBrandingCache, writeRestaurantBrandingCache } from "../lib/restaurant-branding-cache";
import { updateRestaurantShortcut } from "../../modules/restaurant-shortcut";

const BRANDING_CACHE_KEY = "gaurav-pos:restaurant-branding";

export type RestaurantBrandingDraft = Pick<UpdateRestaurantBrandingInput, "restaurantName" | "imageDataUrl" | "iconCrop">;

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
  const cacheWrite = useRef(Promise.resolve());
  const refreshGeneration = useRef(0);
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
    void readRestaurantBrandingCache(cacheKey).then((cached) => {
      if (cached && mounted.current && active) setBranding((current) => current ?? cached);
    }).catch(() => { /* The restaurant name remains available when a cache cannot be read. */ });
    return () => { active = false; mounted.current = false; };
  }, [cacheKey]);

  const apply = useCallback((next: RestaurantBranding) => {
    setBranding(next);
    cacheWrite.current = cacheWrite.current.catch(() => {}).then(() => writeRestaurantBrandingCache(cacheKey, next));
    void cacheWrite.current.catch(() => { /* Online branding remains available if storage is full. */ });
    void updateRestaurantShortcut({ name: next.restaurantName, logoImageDataUrl: next.iconImageDataUrl ?? next.logoImageDataUrl }).catch(() => {});
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const result = await client.restaurantBranding();
      if (mounted.current && currentClient.current === client && generation === refreshGeneration.current) apply(result.branding);
    } catch {
      // Older hubs do not have branding yet; the shell keeps its cached restaurant identity.
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
        : await client.updateRestaurantBranding({ restaurantName: draft.restaurantName.trim(), imageDataUrl: draft.imageDataUrl, iconCrop: draft.iconCrop, expectedUpdatedAt }, approval);
      if (!mounted.current || currentClient.current !== client) return true;
      refreshGeneration.current++;
      apply(result.branding);
      setNotice("Restaurant branding saved.");
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
