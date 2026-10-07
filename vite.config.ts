import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import type { UserConfig } from "vite"
import type { ViteUserConfig } from "vite-plus"

const viteBase = process.env.NODE_ENV === "production" ? "/assets/react/" : "/"
const phoenixOrigin = `http://127.0.0.1:${process.env.PORT || "4000"}`
const phoenixProxy = {
  target: phoenixOrigin,
  headers: { "x-manavault-vite-proxy": "1" },
}
const phoenixSocketProxy = { ...phoenixProxy, ws: true }

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
    // (ManavaultWeb.Plugs.CrossOriginIsolation). Proxied Phoenix responses are not affected.
    headers: { "Cross-Origin-Embedder-Policy": "require-corp" },
    proxy: {
      // Proxy keys are matched against the URL including its query string.
      "^/(\\?|$)": phoenixProxy,
      "^/(settings|cards|decks|collection|trade|scan|login|logout|vendors|health|dev)(/|\\?|$)":
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
      "/shell": phoenixProxy,
      "/fonts": phoenixProxy,
      "/images": phoenixProxy,
      "/screenshots": phoenixProxy,
      "^/(favicon|apple-touch-icon|android-chrome|offline\\.html|robots\\.txt)": phoenixProxy,
    },
  },
} satisfies UserConfig & Pick<ViteUserConfig, "fmt" | "lint">
