import { Platform, StatusBar, type TextStyle } from "react-native";
import { colors } from "@gaurav-pos/shared";

import { getAndroidStatusBarTopInset } from "../lib/safe-area";

export const palette = {
  ink: colors.ink,
  muted: colors.muted,
  paper: colors.panel,
  wash: colors.paper,
  line: colors.line,
  lineSoft: "#e4e4e7",
  lineSubtle: "rgba(24,24,27,0.08)",
  white: "#ffffff",
  green: colors.accent,
  greenSoft: colors.accentSoft,
  greenBold: colors.accentDark,
  greenLine: "#c5ddd8",
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
export const tabularFigures: NonNullable<TextStyle["fontVariant"]> = ["tabular-nums"];
