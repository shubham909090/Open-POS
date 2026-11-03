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
        muted: semanticColor("muted"),
        paper: semanticColor("paper"),
        panel: semanticColor("panel"),
        wash: semanticColor("wash"),
        line: semanticColor("line"),
        "line-strong": semanticColor("line-strong"),
        accent: semanticColor("accent"),
        "accent-dark": semanticColor("accent-dark"),
        "accent-soft": semanticColor("accent-soft"),
        danger: semanticColor("danger"),
        "danger-soft": semanticColor("danger-soft"),
        warning: semanticColor("warning"),
        "warning-soft": semanticColor("warning-soft"),
        blue: semanticColor("blue"),
        "blue-soft": semanticColor("blue-soft"),
        sidebar: semanticColor("sidebar"),
      },
      borderRadius: {
        DEFAULT: semanticColor("radius"),
      },
      boxShadow: {
        pos: semanticColor("shadow"),
        "pos-lg": semanticColor("shadow-lg"),
      },
    },
  },
  plugins: [],
};
