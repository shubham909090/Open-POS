import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import type { RestaurantBranding } from "@gaurav-pos/shared";

import { settingsStyles as s } from "../styles/settings-styles";

const defaultMark = require("../../assets/brand-mark.png");
export const DEFAULT_BRAND_NAME = "Gaurav POS";
// Wide wordmark logos get up to this much extra width so they stay legible without crowding controls.
const MAX_LOGO_ASPECT = 1.8;

export function brandDisplayName(branding: RestaurantBranding | null): string {
  return branding?.restaurantName.trim() || DEFAULT_BRAND_NAME;
}

/** Restaurant logo, or the product mark when the hub has none. Logos are letterboxed, never cropped. */
export function BrandMark({ branding, size = 36, previewUri }: { branding: RestaurantBranding | null; size?: number; previewUri?: string | null }) {
  const uri = previewUri === undefined ? branding?.logoImageDataUrl : previewUri;
  const [aspect, setAspect] = useState(1);
  useEffect(() => { setAspect(1); }, [uri]);
  const width = uri ? Math.round(size * Math.min(MAX_LOGO_ASPECT, Math.max(1, aspect))) : size;
  return (
    <View style={[s.brandMark, { width, height: size, borderRadius: Math.round(size * 0.24) }]}>
      <Image
        source={uri ? { uri } : defaultMark}
        style={uri ? s.brandMarkLogo : s.brandMarkDefault}
        resizeMode={uri ? "contain" : "cover"}
        onLoad={uri ? (event) => {
          const { width: imageWidth, height: imageHeight } = event.nativeEvent.source;
          if (imageWidth > 0 && imageHeight > 0) setAspect(imageWidth / imageHeight);
        } : undefined}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  );
}
