import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { hubApi } from "../hub-api.js";

/** The restaurant identity is shared by the shell and customer bills. */
export function useRestaurantBranding() {
  const query = useQuery({
    queryKey: ["restaurant-branding"],
    queryFn: hubApi.restaurantBranding,
    staleTime: 60_000,
    retry: 1,
  });
  const branding = query.data?.branding;
  const name = branding?.restaurantName.trim() || "Restaurant";
  const logoUrl = branding?.iconImageDataUrl || branding?.logoImageDataUrl || null;
  const initial = Array.from(name)[0]!.toLocaleUpperCase();
  useEffect(() => {
    document.title = `${name} · Hub`;
    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
    }
    const safeInitial = initial.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    icon.href = logoUrl || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#24211e"/><text x="32" y="44" text-anchor="middle" font-family="sans-serif" font-size="40" fill="white">${safeInitial}</text></svg>`)}`;
    icon.removeAttribute("type");
  }, [name, logoUrl, initial]);
  return {
    name: branding?.restaurantName?.trim() || null,
    logoUrl,
    initial,
    hasCustomLogo: Boolean(branding?.logoImageDataUrl),
  };
}
