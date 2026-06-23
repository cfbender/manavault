import type { BackButtonListenerEvent } from "@capacitor/app"
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import { registerCapacitorPluginOnce } from "./capacitor-native-headers.ts"

export type NativeBackAction = "back" | "decks" | "minimize"

type AppPlugin = {
  addListener: (
    eventName: "backButton",
    listenerFunc: (event: BackButtonListenerEvent) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
  minimizeApp: () => Promise<void>
}

type NativeBackOptions = {
  pathname?: () => string
  navigateToDecks: () => void
}

const App = registerCapacitorPluginOnce<AppPlugin>("App", () => registerPlugin<AppPlugin>("App"))

export function nativeBackAction(
  event: BackButtonListenerEvent,
  pathname = window.location.pathname,
  browserHistoryLength = window.history.length,
): NativeBackAction {
  if (pathname === "/") return "minimize"
  if (/^\/decks\/[^/]+$/.test(pathname)) return "decks"
  if (event.canGoBack || browserHistoryLength > 1) return "back"
  return "minimize"
}

export async function initializeNativeBackButton({ pathname, navigateToDecks }: NativeBackOptions) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return

  try {
    await App.addListener("backButton", (event) => {
      const action = nativeBackAction(event, pathname?.())

      if (action === "back") {
        window.history.back()
        return
      }

      if (action === "decks") {
        navigateToDecks()
        return
      }

      void App.minimizeApp()
    })
  } catch {
    // Native App plugin is unavailable in browsers and older shells.
  }
}
