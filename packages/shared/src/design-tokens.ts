/**
 * Canonical design tokens for Gaurav POS.
 *
 * Hub reads these through CSS custom properties (tokens.css + tailwind.config).
 * Mobile reads them directly as TypeScript imports.
 *
 * Keep this minimal — only values used by both apps belong here.
 */

export const colors = {
  ink: "#18181b",
  muted: "#71717a",
  paper: "#fafafa",
  panel: "#ffffff",
  wash: "#f4f4f5",
  line: "#d4d4d8",
  lineStrong: "#a1a1aa",
  accent: "#0f766e",
  accentDark: "#134e4a",
  accentSoft: "#e5f3ed",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  blue: "#1d4ed8",
  blueSoft: "#eff6ff",
  sidebar: "#18181b",
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 18,
  xl: 21,
  "2xl": 25,
} as const;

export type ColorToken = keyof typeof colors;
