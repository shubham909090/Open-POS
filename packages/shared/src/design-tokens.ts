/**
 * Canonical design tokens for Gaurav POS.
 *
 * Hub reads these through CSS custom properties (tokens.css + tailwind.config).
 * Mobile reads them directly as TypeScript imports.
 *
 * Keep this minimal — only values used by both apps belong here.
 * Direction "the pass": graphite chrome, warm paper, white cards; colour carries meaning only.
 */

export const colors = {
  ink: "#1c1917",
  ink2: "#44403c",
  focusRing: "#44403c",
  muted: "#6f675f",
  faint: "#a1988e",
  paper: "#ece8e1",
  panel: "#ffffff",
  wash: "#f6f3ef",
  sunken: "#e4dfd7",
  line: "#e5dfd6",
  lineStrong: "#cbc2b5",
  chrome: "#1f1c19",
  chromeRaised: "#2b2723",
  chromeText: "#f1ede7",
  chromeMuted: "#a8a097",
  /** Saffron: kitchen and running table. */
  accent: "#c2410c",
  accentDark: "#9a3412",
  accentBright: "#f26a1b",
  accentSoft: "#fff0e5",
  accentLine: "#f6c7a3",
  /** Green: money settled only. */
  success: "#157f3c",
  successSoft: "#e9f6ee",
  successLine: "#b5dfc4",
  warning: "#9a5b06",
  warningSoft: "#fdf5df",
  warningLine: "#ecd08f",
  danger: "#b42318",
  dangerSoft: "#fef0ef",
  dangerLine: "#f3c0bb",
  /** Indigo: bill printed, waiting for money. */
  blue: "#4338ca",
  blueSoft: "#eef0fd",
  blueLine: "#c8cdf6",
  sidebar: "#1f1c19",
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

export const controlHeight = { desktop: 32, touch: 44 } as const;
export const feedbackTiming = { successNoticeMs: 4000 } as const;

export type ColorToken = keyof typeof colors;
