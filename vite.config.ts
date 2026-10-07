import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import type { UserConfig } from "vite"
import type { ViteUserConfig } from "vite-plus"

const viteBase = process.env.NODE_ENV === "production" ? "/assets/react/" : "/"
const backendOrigin = `http://127.0.0.1:${process.env.PORT || "4000"}`
const backendProxy = {
  target: backendOrigin,
  headers: { "x-manavault-vite-proxy": "1" },
}
const backendSocketProxy = { ...backendProxy, ws: true }

export default {
  base: viteBase,
  fmt: {
    ignorePatterns: [
      ".backlog/**",
      "aube-lock.yaml",
      "assets/react/src/gql/**",
      "assets/react/src/routeTree.gen.ts",
      "rust/.sqlx/**",
      "rust/target/**",
    ],
    semi: false,
  },
  lint: {
    ignorePatterns: [
      "assets/react/src/gql/**",
      "assets/react/src/routeTree.gen.ts",
      "rust/target/**",
    ],
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
    rolldownOptions: {
      input: "assets/react/src/main.tsx",
      output: {
        entryFileNames: "app.js",
        assetFileNames: "assets/[name][extname]",
        codeSplitting: {
          groups: [
            {
              name: "react-runtime",
              test: /\/node_modules\/(?:react|react-dom|scheduler)\//,
              priority: 30,
            },
            { name: "katex", test: /\/node_modules\/katex\//, priority: 20 },
            {
              name: "markdown",
              test: /\/node_modules\/(?:react-markdown|remark-[^/]+|rehype-[^/]+)\//,
              priority: 10,
            },
          ],
        },
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
    // Worker scripts must carry the same embedder policy as the isolated `/scan` document
    // (the backend's `web::browser::cross_origin_isolation`). Proxied backend responses are not affected.
    headers: { "Cross-Origin-Embedder-Policy": "require-corp" },
    proxy: {
      // Proxy keys are matched against the URL including its query string.
      "^/(\\?|$)": backendProxy,
      "^/(settings|cards|decks|collection|trade|scan|login|logout|vendors|health|dev)(/|\\?|$)":
        backendProxy,
      "/share": backendProxy,
      "/api": backendProxy,
      "/socket": backendSocketProxy,
      "/scryfall-assets": backendProxy,
      "/site.webmanifest": backendProxy,
      "/sw.js": backendProxy,
      "/.well-known": backendProxy,
      "/assets/css": backendProxy,
      "/shell": backendProxy,
      "/fonts": backendProxy,
      "/images": backendProxy,
      "/screenshots": backendProxy,
      "^/(favicon|apple-touch-icon|android-chrome|offline\\.html|robots\\.txt)": backendProxy,
    },
  },
} satisfies UserConfig & Pick<ViteUserConfig, "fmt" | "lint">
