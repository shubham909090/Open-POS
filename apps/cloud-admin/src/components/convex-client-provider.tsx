"use client";

import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import { ConvexReactClient } from "convex/react";
import { useCallback, useState, type ReactNode } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(() => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
    }

    return new ConvexReactClient(convexUrl);
  });

  return (
    <AuthKitProvider>
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuthKitForConvex}>
        {children}
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}

function useAuthKitForConvex() {
  const { user, loading } = useAuth();
  const { getAccessToken } = useAccessToken();

  const fetchToken = useCallback(async () => {
    if (!user) return null;
    return (await getAccessToken()) ?? null;
  }, [getAccessToken, user]);

  return {
    isLoading: loading,
    user,
    getAccessToken: fetchToken
  };
}
