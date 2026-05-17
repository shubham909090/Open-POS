/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.js", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#15130f",
        muted: "#78716a",
        paper: "#fffdf8",
        wash: "#f0ead9",
        line: "#d8cebd",
        primary: "#0d5248",
        success: "#14665d",
        warning: "#986022",
        danger: "#a83a2f",
        bill: "#1c5faa",
      },
      borderRadius: {
        pos: "10px",
      },
    },
  },
  plugins: [],
};
