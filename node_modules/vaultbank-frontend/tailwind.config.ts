import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1B4FD8",
          dark: "#1340B0",
        },
        secondary: "#0F172A",
        accent: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B",
        background: "#F8FAFC",
        surface: "#FFFFFF",
        border: "#E2E8F0",
        muted: "#64748B",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        focus: "0 10px 30px rgba(27, 79, 216, 0.14)",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-10px)" },
          "40%, 80%": { transform: "translateX(10px)" },
        },
      },
      animation: {
        shake: "shake 420ms ease-in-out",
      },
    },
  },
  safelist: [
    "bg-primary",
    "bg-primary-dark",
    "text-primary",
    "border-primary",
    "ring-primary/20",
    "bg-danger",
    "text-danger",
    "border-danger",
    "bg-warning",
    "text-warning",
    "bg-accent",
    "text-accent",
    "border-accent",
  ],
  plugins: [],
} satisfies Config;

export default config;
