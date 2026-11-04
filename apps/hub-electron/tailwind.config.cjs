// Preserve semantic CSS colors while allowing Tailwind opacity modifiers.
const semanticColor = (name) => ({ opacityValue }) => opacityValue === undefined
  ? `var(--${name})`
  : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: semanticColor("ink"),
        "ink-2": semanticColor("ink-2"),
        faint: semanticColor("faint"),
        sunken: semanticColor("sunken"),
        chrome: semanticColor("chrome"),
        "success-line": semanticColor("success-line"),
        muted: semanticColor("muted"),
        paper: semanticColor("paper"),
        panel: semanticColor("panel"),
        wash: semanticColor("wash"),
        line: semanticColor("line"),
        "line-strong": semanticColor("line-strong"),
        accent: semanticColor("accent"),
        "accent-dark": semanticColor("accent-dark"),
        "accent-soft": semanticColor("accent-soft"),
        "accent-line": semanticColor("accent-line"),
        success: semanticColor("success"),
        "success-soft": semanticColor("success-soft"),
        danger: semanticColor("danger"),
        "danger-soft": semanticColor("danger-soft"),
        "danger-line": semanticColor("danger-line"),
        warning: semanticColor("warning"),
        "warning-soft": semanticColor("warning-soft"),
        "warning-line": semanticColor("warning-line"),
        blue: semanticColor("blue"),
        "blue-soft": semanticColor("blue-soft"),
        "blue-line": semanticColor("blue-line"),
        sidebar: semanticColor("sidebar"),
      },
      borderRadius: {
        DEFAULT: semanticColor("radius"),
      },
      boxShadow: {
        pos: semanticColor("shadow"),
        "pos-md": semanticColor("shadow-md"),
        "pos-lg": semanticColor("shadow-lg"),
      },
    },
  },
  plugins: [],
};
