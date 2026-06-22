import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"

export type SharedImportPayload = {
  text: string
  fileName?: string | null
  mimeType?: string | null
  source?: string | null
}

export type NativeOpenPayload =
  | SharedImportPayload
  | {
      url: string
      source?: string | null
    }

type SharedImportPlugin = {
  getPendingImport: () => Promise<{ import?: NativeOpenPayload | null }>
  addListener: (
    eventName: "sharedImport",
    listenerFunc: (payload: NativeOpenPayload) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
}

const SharedImport = registerPlugin<SharedImportPlugin>("SharedImport")
const listeners = new Set<(payload: SharedImportPayload) => void>()

let pendingImport: SharedImportPayload | null = null

function isSharedImportPayload(payload?: NativeOpenPayload | null): payload is SharedImportPayload {
  return Boolean(payload && "text" in payload && payload.text.trim())
}

function isNativeLinkPayload(payload?: NativeOpenPayload | null): payload is Extract<NativeOpenPayload, { url: string }> {
  return Boolean(payload && "url" in payload && payload.url.trim())
}

export function takeSharedImport() {
  const payload = pendingImport
  pendingImport = null
  return payload
}

export function subscribeSharedImport(listener: (payload: SharedImportPayload) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function initializeNativeSharedImport(onOpen: (payload: NativeOpenPayload) => void) {
  if (!Capacitor.isNativePlatform()) return

  const receive = (payload?: NativeOpenPayload | null) => {
    if (isSharedImportPayload(payload)) {
      pendingImport = payload
      for (const listener of listeners) listener(payload)
      onOpen(payload)
      return
    }

    if (isNativeLinkPayload(payload)) onOpen(payload)
  }

  try {
    const result = await SharedImport.getPendingImport()
    receive(result.import)
  } catch {
    // Native bridge is unavailable in the browser and older shells.
  }

  try {
    await SharedImport.addListener("sharedImport", receive)
  } catch {
    // Native bridge is unavailable in the browser and older shells.
  }
}
