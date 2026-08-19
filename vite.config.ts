import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

const viteBase = process.env.NODE_ENV === "production" ? "/assets/react/" : "/"
const phoenixOrigin = `http://127.0.0.1:${process.env.PORT || "4000"}`
const phoenixProxy = {
  target: phoenixOrigin,
  headers: { "x-manavault-vite-proxy": "1" },
}
const phoenixSocketProxy = { ...phoenixProxy, ws: true }

export default defineConfig({
  base: viteBase,
  fmt: {
    ignorePatterns: [".backlog/**", "assets/react/src/gql/**", "assets/react/src/routeTree.gen.ts"],
    semi: false,
  },
  lint: {
    ignorePatterns: ["assets/react/src/gql/**", "assets/react/src/routeTree.gen.ts"],
  },
  // vite@8 Plugin type is incompatible with vite-plus-core@0.2.8 Plugin type
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "assets/react/src/routes",
      generatedRouteTree: "assets/react/src/routeTree.gen.ts",
      autoCodeSplitting: true,
      quoteStyle: "double",
    }) as any,
    react() as any,
  ] as any,
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
    allowedHosts: [".onamp.dev"],
    proxy: {
      "^/$": phoenixProxy,
      "^/(settings|cards|decks|collection|trade|login|logout|vendors|health|dev)(/|$)":
        phoenixProxy,
      "/share": phoenixProxy,
      "/api": phoenixProxy,
      "/socket": phoenixSocketProxy,
      "/phoenix": phoenixSocketProxy,
      "/scryfall-assets": phoenixProxy,
      "/site.webmanifest": phoenixProxy,
      "/sw.js": phoenixProxy,
      "/.well-known": phoenixProxy,
      "/assets/css": phoenixProxy,
      "/fonts": phoenixProxy,
      "/images": phoenixProxy,
      "/screenshots": phoenixProxy,
      "^/(favicon|apple-touch-icon|android-chrome|offline\\.html|robots\\.txt)": phoenixProxy,
    },
  },
})
