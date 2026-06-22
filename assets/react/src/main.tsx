import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import "./pwa"
import { ThemeProvider } from "./lib/theme"
import { routeTree } from "./routeTree.gen"
import { initializeNativeSharedImport, type NativeOpenPayload } from "./lib/native-shared-import"
import { nativeAppPath, parseNativeRoute, type NativeRoute } from "./lib/native-open"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

function openNativePath(path: string) {
  navigateNativeRoute(parseNativeRoute(path))
}

function navigateNativeRoute(route: NativeRoute) {
  switch (route.to) {
    case "/":
      void router.navigate({ to: "/" })
      return
    case "/collection":
      void router.navigate({ to: "/collection", search: route.search })
      return
    case "/cards":
      void router.navigate({ to: "/cards", search: route.search })
      return
    case "/cards/$id":
      void router.navigate({
        to: "/cards/$id",
        params: route.params,
        search: route.search,
      })
      return
    case "/decks":
      void router.navigate({ to: "/decks" })
      return
    case "/decks/$id":
      void router.navigate({ to: "/decks/$id", params: route.params })
      return
    case "/decks/$id/playtest":
      void router.navigate({ to: "/decks/$id/playtest", params: route.params })
      return
    case "/settings":
      void router.navigate({ to: "/settings" })
      return
    case "/share/decks/$token":
      void router.navigate({ to: "/share/decks/$token", params: route.params })
      return
  }
}

function handleNativeOpen(payload: NativeOpenPayload) {
  if ("url" in payload) {
    const path = nativeAppPath(payload.url, window.location.origin)
    openNativePath(path ?? "/")
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
