import type { BackButtonListenerEvent } from "@capacitor/app"
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import { registerCapacitorPluginOnce } from "./capacitor-native-headers.ts"
import { closeTopNativeBackModal, hasNativeBackModal } from "./native-modal-stack.ts"

export type NativeBackAction = "back" | "decks" | "modal" | "minimize"

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
  modalOpen = false,
): NativeBackAction {
  if (modalOpen) return "modal"
  if (pathname === "/") return "minimize"
  if (/^\/decks\/[^/]+$/.test(pathname)) return "decks"
  if (event.canGoBack || browserHistoryLength > 1) return "back"
  return "minimize"
}

export async function initializeNativeBackButton({ pathname, navigateToDecks }: NativeBackOptions) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return

  try {
    await App.addListener("backButton", (event) => {
      const action = nativeBackAction(
        event,
        pathname?.(),
        window.history.length,
        hasNativeBackModal(),
      )

      if (action === "modal") {
        closeTopNativeBackModal()
        return
      }

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
