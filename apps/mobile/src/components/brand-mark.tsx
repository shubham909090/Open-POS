import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import type { RestaurantBranding } from "@gaurav-pos/shared";

import { settingsStyles as s } from "../styles/settings-styles";

export const DEFAULT_BRAND_NAME = "Restaurant";
// Give wide wordmarks room without pushing the header actions off screen.
const MAX_LOGO_ASPECT = 1.8;

export function brandDisplayName(branding: RestaurantBranding | null): string {
  return branding?.restaurantName.trim() || DEFAULT_BRAND_NAME;
}

export function brandInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0] ?? "").join("").toLocaleUpperCase();
}

/** Keep logos uncropped. The restaurant name supplies a mark when its image is absent or unreadable. */
export function BrandMark({ branding, size = 36, previewUri, previewName }: { branding: RestaurantBranding | null; size?: number; previewUri?: string | null; previewName?: string }) {
  const uri = previewUri === undefined ? branding?.iconImageDataUrl ?? branding?.logoImageDataUrl : previewUri;
  const [aspect, setAspect] = useState(1);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => { setAspect(1); }, [uri]);
  const logoUri = uri && uri !== failedUri ? uri : null;
  const width = logoUri ? Math.round(size * Math.min(MAX_LOGO_ASPECT, Math.max(1, aspect))) : size;
  const name = previewName === undefined ? brandDisplayName(branding) : previewName.trim() || DEFAULT_BRAND_NAME;
  return (
    <View style={[s.brandMark, { width, height: size, borderRadius: Math.round(size * 0.24) }]}>
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          style={s.brandMarkLogo}
          resizeMode="contain"
          onLoad={(event) => {
            const { width: imageWidth, height: imageHeight } = event.nativeEvent.source;
            if (imageWidth > 0 && imageHeight > 0) setAspect(imageWidth / imageHeight);
          }}
          onError={() => setFailedUri(uri ?? null)}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <Text style={[s.brandMarkInitials, { fontSize: Math.round(size * 0.4) }]} accessible={false}>{brandInitials(name)}</Text>
      )}
    </View>
  );
}
