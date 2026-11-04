import { Platform, StatusBar, type TextStyle } from "react-native";
import { colors } from "@gaurav-pos/shared";

import { getAndroidStatusBarTopInset } from "../lib/safe-area";

/**
 * Mobile palette, mapped from the shared "pass" tokens.
 * Legacy key names (green*, amber*, blueBill*) are kept so screens stay readable,
 * but "green" is now the brand action colour (saffron) and money settled uses `success`.
 */
export const palette = {
  ink: colors.ink,
  inkSoft: colors.ink2,
  muted: colors.muted,
  faint: colors.faint,
  paper: colors.panel,
  wash: colors.paper,
  sunken: colors.sunken,
  softWash: colors.wash,
  line: colors.line,
  lineSoft: colors.line,
  lineStrong: colors.lineStrong,
  lineSubtle: "rgba(28,25,23,0.08)",
  white: "#ffffff",
  chrome: colors.chrome,
  chromeRaised: colors.chromeRaised,
  chromeText: colors.chromeText,
  chromeMuted: colors.chromeMuted,
  green: colors.accent,
  greenSoft: colors.accentSoft,
  greenBold: colors.accentDark,
  greenLine: colors.accentLine,
  accentBright: colors.accentBright,
  success: colors.success,
  successSoft: colors.successSoft,
  successLine: colors.successLine,
  amber: colors.warning,
  amberSoft: colors.warningSoft,
  amberBold: colors.warning,
  amberLine: colors.warningLine,
  red: colors.danger,
  redSoft: colors.dangerSoft,
  redLine: colors.dangerLine,
  surfaceElevated: "#ffffff",
  inverseText: "#ffffff",
  inverseMuted: colors.chromeMuted,
  shadow: "rgba(28,25,23,0.08)",
  shadowMedium: "rgba(28,25,23,0.16)",
  shadowStrong: "rgba(20,16,12,0.30)",
  blueBill: colors.blue,
  blueBillSoft: colors.blueSoft,
  blueBillLine: colors.blueLine,
  scanner: "#111827"
};

export const androidStatusBarTopInset = getAndroidStatusBarTopInset(Platform.OS, StatusBar.currentHeight);
export const tabularFigures: NonNullable<TextStyle["fontVariant"]> = ["tabular-nums"];
