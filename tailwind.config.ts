import type { Config } from "tailwindcss";

// Design tokens from docs/UI_SPEC.md §1. Values live as CSS variables in globals.css.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "text-dim": "rgb(var(--text-dim) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-press": "rgb(var(--primary-press) / <alpha-value>)",
        up: "rgb(var(--up) / <alpha-value>)",
        down: "rgb(var(--down) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        link: "rgb(var(--link) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        balance: ["40px", { lineHeight: "44px", fontWeight: "700" }],
        "detail-price": ["32px", { lineHeight: "38px", fontWeight: "700" }],
        "sheet-title": ["20px", { lineHeight: "26px", fontWeight: "600" }],
        section: ["17px", { lineHeight: "22px", fontWeight: "600" }],
        row: ["17px", { lineHeight: "22px" }],
        tab: ["16px", { lineHeight: "22px" }],
        chip: ["15px", { lineHeight: "20px" }],
        secondary: ["14px", { lineHeight: "18px" }],
        change: ["13px", { lineHeight: "16px", fontWeight: "500" }],
        pill: ["11px", { lineHeight: "14px", fontWeight: "500" }],
      },
      borderRadius: {
        card: "16px",
        chip: "12px",
        cta: "14px",
        sheet: "24px",
        badge: "6px",
      },
      spacing: {
        gutter: "16px",
        row: "64px",
        nav: "64px",
      },
      maxWidth: {
        app: "430px",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "flash-up": { "0%": { backgroundColor: "rgb(var(--up) / 0.15)" }, "100%": { backgroundColor: "transparent" } },
        "flash-down": { "0%": { backgroundColor: "rgb(var(--down) / 0.15)" }, "100%": { backgroundColor: "transparent" } },
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        "flash-up": "flash-up 150ms ease-out",
        "flash-down": "flash-down 150ms ease-out",
        "live-dot": "pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
