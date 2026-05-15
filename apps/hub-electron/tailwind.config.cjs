/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        paper: "var(--paper)",
        panel: "var(--panel)",
        wash: "var(--wash)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "accent-soft": "var(--accent-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        blue: "var(--blue)",
        "blue-soft": "var(--blue-soft)",
        sidebar: "var(--sidebar)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      boxShadow: {
        pos: "var(--shadow)",
        "pos-lg": "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
