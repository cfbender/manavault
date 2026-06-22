import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"

type SharedImportPayload = {
  text: string
  fileName?: string | null
  mimeType?: string | null
  source?: string | null
}

type SharedImportPlugin = {
  getPendingImport: () => Promise<{ import?: SharedImportPayload | null }>
  addListener: (
    eventName: "sharedImport",
    listenerFunc: (payload: SharedImportPayload) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
}

const SharedImport = registerPlugin<SharedImportPlugin>("SharedImport")
const listeners = new Set<(payload: SharedImportPayload) => void>()

let pendingImport: SharedImportPayload | null = null

export type { SharedImportPayload }

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

export async function initializeNativeSharedImport(onImport: () => void) {
  if (!Capacitor.isNativePlatform()) return

  const receive = (payload?: SharedImportPayload | null) => {
    if (!payload?.text?.trim()) return

    pendingImport = payload
    for (const listener of listeners) listener(payload)
    onImport()
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
