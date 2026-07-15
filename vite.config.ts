import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

const viteBase = process.env.NODE_ENV === "production" ? "/assets/react/" : "/"

export default defineConfig({
  base: viteBase,
  fmt: {
    ignorePatterns: [".backlog/**", "assets/react/src/gql/**", "assets/react/src/routeTree.gen.ts"],
    semi: false,
  },
  lint: {
    ignorePatterns: ["assets/react/src/gql/**", "assets/react/src/routeTree.gen.ts"],
  },
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
  optimizeDeps: {
    include: ["@apollo/client/react"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    origin: "http://127.0.0.1:5173",
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket": {
        target: "ws://127.0.0.1:4000",
        ws: true,
      },
      "/site.webmanifest": "http://127.0.0.1:4000",
      "/android-chrome-192x192.png": "http://127.0.0.1:4000",
      "/android-chrome-512x512.png": "http://127.0.0.1:4000",
      "/sw.js": "http://127.0.0.1:4000",
    },
  },
})
