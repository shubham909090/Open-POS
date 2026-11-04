import { Platform, StatusBar, type TextStyle } from "react-native";
import { colors } from "@gaurav-pos/shared";

import { getAndroidStatusBarTopInset } from "../lib/safe-area";

export const palette = {
  ink: colors.ink,
  muted: colors.muted,
  paper: colors.panel,
  wash: colors.paper,
  line: colors.line,
  lineSoft: colors.line,
  lineSubtle: "rgba(32,38,36,0.08)",
  white: "#ffffff",
  green: colors.accent,
  greenSoft: colors.accentSoft,
  greenBold: colors.accentDark,
  success: colors.success,
  successSoft: colors.successSoft,
  greenLine: colors.accentLine,
  amber: colors.warning,
  amberSoft: colors.warningSoft,
  amberBold: colors.warning,
  amberLine: colors.warningLine,
  red: colors.danger,
  redSoft: colors.dangerSoft,
  redLine: colors.dangerLine,
  surfaceElevated: "#ffffff",
  inverseText: "#ffffff",
  inverseMuted: "#e4e4e7",
  shadow: "rgba(24,43,31,0.08)",
  shadowMedium: "rgba(24,43,31,0.14)",
  shadowStrong: "rgba(24,43,31,0.25)",
  blueBill: colors.blue,
  blueBillSoft: colors.blueSoft,
  scanner: "#111827"
};

export const androidStatusBarTopInset = getAndroidStatusBarTopInset(Platform.OS, StatusBar.currentHeight);
export const tabularFigures: NonNullable<TextStyle["fontVariant"]> = ["tabular-nums"];
