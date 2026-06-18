import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "assets/react/src/routes",
      generatedRouteTree: "assets/react/src/routeTree.gen.ts",
      autoCodeSplitting: true,
      quoteStyle: "double",
    }),
    react(),
  ],
  build: {
    emptyOutDir: true,
    manifest: true,
    outDir: "priv/static/assets/react",
    rollupOptions: {
      input: "assets/react/src/main.tsx",
      output: {
        entryFileNames: "app.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    origin: "http://127.0.0.1:5173",
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/site.webmanifest": "http://127.0.0.1:4000",
      "/android-chrome-192x192.png": "http://127.0.0.1:4000",
      "/android-chrome-512x512.png": "http://127.0.0.1:4000",
      "/sw.js": "http://127.0.0.1:4000",
    },
  },
})
