/**
 * Canonical design tokens for Gaurav POS.
 *
 * Hub reads these through CSS custom properties (tokens.css + tailwind.config).
 * Mobile reads them directly as TypeScript imports.
 *
 * Keep this minimal — only values used by both apps belong here.
 */

export const colors = {
  ink: "#202624",
  muted: "#657168",
  paper: "#f7f8f5",
  panel: "#ffffff",
  wash: "#f0f3ed",
  line: "#dfe5dc",
  lineStrong: "#bcc8bf",
  accent: "#11695d",
  accentDark: "#0d5148",
  accentSoft: "#e8f2ed",
  accentLine: "#b9d4c9",
  success: "#28754b",
  successSoft: "#eaf4ed",
  warning: "#92630b",
  warningSoft: "#fff5e2",
  warningLine: "#e8c88d",
  danger: "#b53a35",
  dangerSoft: "#fff1ef",
  dangerLine: "#ecc1bb",
  blue: "#245c92",
  blueSoft: "#edf3fa",
  blueLine: "#bdd0e5",
  sidebar: "#eff2ec",
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

export const controlHeight = { desktop: 36, touch: 48 } as const;
export const feedbackTiming = { successNoticeMs: 4000 } as const;

export type ColorToken = keyof typeof colors;
