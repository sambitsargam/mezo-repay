import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: "rgb(var(--ivory) / <alpha-value>)", deep: "rgb(var(--ivory-deep) / <alpha-value>)" },
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: { DEFAULT: "rgb(var(--ink) / <alpha-value>)", soft: "rgb(var(--ink-soft) / <alpha-value>)", muted: "rgb(var(--ink-muted) / <alpha-value>)" },
        line: { DEFAULT: "rgb(var(--line) / <alpha-value>)", strong: "rgb(var(--line-strong) / <alpha-value>)" },
        copper: { DEFAULT: "rgb(var(--copper) / <alpha-value>)", deep: "rgb(var(--copper-deep) / <alpha-value>)", wash: "rgb(var(--copper-wash) / <alpha-value>)" },
        sage: { DEFAULT: "rgb(var(--sage) / <alpha-value>)", deep: "rgb(var(--sage-deep) / <alpha-value>)", wash: "rgb(var(--sage-wash) / <alpha-value>)" },
        amber: { DEFAULT: "rgb(var(--amber) / <alpha-value>)", wash: "rgb(var(--amber-wash) / <alpha-value>)" },
        rust: { DEFAULT: "rgb(var(--rust) / <alpha-value>)", wash: "rgb(var(--rust-wash) / <alpha-value>)" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgb(var(--ink) / 0.03), 0 1px 3px rgb(var(--ink) / 0.05)",
        lift: "0 1px 0 rgb(var(--ink) / 0.04), 0 8px 24px -8px rgb(var(--ink) / 0.14)",
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
} satisfies Config;
