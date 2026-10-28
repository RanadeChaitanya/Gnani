/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const backend = process.env.SAAR_BACKEND ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Saar — consent-first call notes",
        short_name: "Saar",
        description: "Two-phone calls, live captions with consent, and faithful notes.",
        theme_color: "#0f766e",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // app shell only; never cache the API or sockets
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { "/api": backend, "/ws": { target: backend.replace("http", "ws"), ws: true } },
  },
  build: { outDir: "../backend/app/static", emptyOutDir: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
