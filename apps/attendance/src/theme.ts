import { Platform } from "react-native";

export const colors = {
  ink: "#17251D",
  inkMuted: "#667168",
  forest: "#173F32",
  forestSoft: "#DDE8E0",
  ivory: "#F6F1E7",
  paper: "#FFFDF8",
  line: "#DED8CC",
  white: "#FFFFFF",
  amber: "#D8912E",
  amberSoft: "#F7E8C9",
  lilac: "#7C6B98",
  lilacSoft: "#ECE5F1",
  rose: "#A8544E",
  roseSoft: "#F5DFDB",
  blue: "#557487",
  blueSoft: "#E1EBEF",
  scrim: "rgba(18, 31, 24, 0.52)",
} as const;

export const font = {
  display: Platform.select({ android: "serif", default: "Georgia" }),
  body: "Manrope_400Regular",
  medium: "Manrope_600SemiBold",
} as const;

export const shadow = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: "#15281E",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
});
