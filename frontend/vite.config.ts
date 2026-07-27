import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certDir = path.resolve(
  __dirname,
  "../backend-service/nginx/certs",
);

export default defineConfig({
  root: __dirname,

  cacheDir: path.resolve(
    __dirname,
    "node_modules/.vite",
  ),

  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  optimizeDeps: {
    include: [
      "recharts",
      "eventemitter3",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
      "scheduler",
      "zustand",
      "zustand/middleware",
      "use-sync-external-store/with-selector.js",
      "use-sync-external-store/shim/with-selector",
      "use-sync-external-store/shim/with-selector.js",
    ],
  },

  server: {
    host: "0.0.0.0",
    strictPort: true,
    port: 5173,

    https: {
      key: fs.readFileSync(
        path.join(certDir, "self-signed.key"),
      ),
      cert: fs.readFileSync(
        path.join(certDir, "self-signed.crt"),
      ),
    },

    proxy: {
      "/api": {
        target: "https://localhost",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});