import { useQuery } from "@tanstack/react-query";
import { hubApi } from "../hub-api.js";

/** Bundled app mark (apps/hub-electron/public) used when the restaurant has no logo. */
export const DEFAULT_BRAND_MARK_URL = "/brand-mark.png";

/** Restaurant name and logo for the shell. Any paired role may read it; failures fall back to the app mark. */
export function useRestaurantBranding() {
  const query = useQuery({
    queryKey: ["restaurant-branding"],
    queryFn: hubApi.restaurantBranding,
    staleTime: 60_000,
    retry: 1,
  });
  const branding = query.data?.branding;
  return {
    name: branding?.restaurantName?.trim() || null,
    logoUrl: branding?.logoImageDataUrl || DEFAULT_BRAND_MARK_URL,
    hasCustomLogo: Boolean(branding?.logoImageDataUrl),
  };
}
