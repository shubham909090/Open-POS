import { Platform, StatusBar } from "react-native";

import { getAndroidStatusBarTopInset } from "../lib/safe-area";

export const palette = {
  ink: "#18181b",
  muted: "#71717a",
  paper: "#fafafa",
  wash: "#f4f4f5",
  line: "#d4d4d8",
  lineSoft: "#e4e4e7",
  lineSubtle: "rgba(24,24,27,0.08)",
  white: "#ffffff",
  green: "#0f766e",
  greenSoft: "#ecfdf5",
  greenBold: "#115e59",
  greenLine: "#99f6e4",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBold: "#92400e",
  amberLine: "#fde68a",
  red: "#b91c1c",
  redSoft: "#fef2f2",
  redLine: "#fecaca",
  surfaceElevated: "#ffffff",
  inverseText: "#ffffff",
  inverseMuted: "#e4e4e7",
  shadow: "rgba(24,24,27,0.08)",
  shadowMedium: "rgba(24,24,27,0.14)",
  shadowStrong: "rgba(24,24,27,0.25)",
  blueBill: "#1d4ed8",
  blueBillSoft: "#eff6ff",
  scanner: "#111827"
};

export const androidStatusBarTopInset = getAndroidStatusBarTopInset(Platform.OS, StatusBar.currentHeight);
