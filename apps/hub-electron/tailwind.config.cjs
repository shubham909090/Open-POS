/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211c",
        muted: "#68756d",
        paper: "#f7f6f0",
        panel: "#fffdf7",
        line: "#d8ded4",
        accent: "#0f766e",
        danger: "#b42318"
      },
      boxShadow: {
        pos: "0 18px 50px rgba(23, 33, 28, 0.1)"
      }
    }
  },
  plugins: []
};
