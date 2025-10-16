// tailwind.config.js
module.exports = {
  content: ["./**/*.{html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        surface: "#ffffff",
        "surface-muted": "#f7f7f5",
        "surface-inverse": "#0e1116",
        ink: "#0e1116",
        "ink-2": "#3b4150",
        "ink-3": "#6b7280",
        "ink-4": "#9aa1ad",
        line: "#ececea",
        "line-strong": "#d8d8d2",
        brand: {
          blue: "#3a6dc5",
          yellow: "#f7bf33",
          red: "#f94141",
          green: "#0f8657",
          "blue-50": "#ecf1fa",
          "yellow-50": "#fef6e0",
          "red-50": "#fee5e5",
          "green-50": "#e2f1ea",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-2xl": ["4.5rem", { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: 600 }],
        "display-xl": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: 600 }],
        "display-lg": ["2.5rem", { lineHeight: "1.10", letterSpacing: "-0.02em", fontWeight: 600 }],
        "h1": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: 600 }],
        "h2": ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: 600 }],
