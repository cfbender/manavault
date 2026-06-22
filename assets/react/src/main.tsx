import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import "./pwa"
import { ThemeProvider } from "./lib/theme"
import { routeTree } from "./routeTree.gen"
import { initializeNativeSharedImport, type NativeOpenPayload } from "./lib/native-shared-import"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({ routeTree })

const appLinkHosts = new Set(["manavault.cfb.dev", "www.manavault.cfb.dev"])

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

function nativeAppPath(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === "manavault:") return `${url.pathname}${url.search}${url.hash}` || "/"
    if (url.protocol !== "https:" || !appLinkHosts.has(url.host)) return null

    return `${url.pathname}${url.search}${url.hash}` || "/"
  } catch {
    return null
  }
}

function openNativePath(path: string) {
  const shareDeckMatch = path.match(/^\/share\/decks\/([^/?#]+)/)
  if (shareDeckMatch?.[1]) {
    void router.navigate({
      to: "/share/decks/$token",
      params: { token: decodeURIComponent(shareDeckMatch[1]) },
    })
    return
  }

  if (path === "/" || path.startsWith("/cards") || path.startsWith("/collection") || path.startsWith("/decks") || path.startsWith("/settings")) {
    window.history.pushState(null, "", path)
    void router.invalidate()
    return
  }

  void router.navigate({ to: "/" })
}

function handleNativeOpen(payload: NativeOpenPayload) {
  if ("url" in payload) {
    const path = nativeAppPath(payload.url)
    if (path) openNativePath(path)
    return
  }

  void router.navigate({ to: "/collection", search: { importFile: true } })
}

void initializeNativeSharedImport(handleNativeOpen)

createRoot(document.getElementById("manavault-root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </QueryClientProvider>,
)
