import type { BackButtonListenerEvent } from "@capacitor/app"
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import { registerCapacitorPluginOnce } from "./capacitor-native-headers.ts"

export type NativeBackAction = "back" | "minimize"

type AppPlugin = {
  addListener: (
    eventName: "backButton",
    listenerFunc: (event: BackButtonListenerEvent) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
  minimizeApp: () => Promise<void>
}

const App = registerCapacitorPluginOnce<AppPlugin>("App", () => registerPlugin<AppPlugin>("App"))

export function nativeBackAction(event: BackButtonListenerEvent, browserHistoryLength = window.history.length): NativeBackAction {
  if (event.canGoBack || browserHistoryLength > 1) return "back"
  return "minimize"
}

export async function initializeNativeBackButton() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return

  try {
    await App.addListener("backButton", (event) => {
      if (nativeBackAction(event) === "back") {
        window.history.back()
        return
      }

      void App.minimizeApp()
    })
  } catch {
    // Native App plugin is unavailable in browsers and older shells.
  }
}
