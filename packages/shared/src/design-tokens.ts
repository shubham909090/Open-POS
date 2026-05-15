/**
 * Canonical design tokens for Gaurav POS.
 *
 * Hub reads these through CSS custom properties (tokens.css + tailwind.config).
 * Mobile reads them directly as TypeScript imports.
 *
 * Keep this minimal — only values used by both apps belong here.
 */

export const colors = {
  ink: "#191815",
  muted: "#6b6560",
  paper: "#f5f5ef",
  panel: "#fffdf7",
  wash: "#f0ead9",
  line: "#d8cebd",
  lineStrong: "#a8a298",
  accent: "#0f766e",
  accentDark: "#134e4a",
  accentSoft: "#e5f3ed",
  warning: "#986022",
  warningSoft: "#fff0d6",
  danger: "#a83a2f",
  dangerSoft: "#fff0ed",
  blue: "#1d4ed8",
  blueSoft: "#eff6ff",
  sidebar: "#0c211b",
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
