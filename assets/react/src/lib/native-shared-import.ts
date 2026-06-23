import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import { ensureCapacitorNativePluginHeader, registerCapacitorPluginOnce } from "./capacitor-native-headers.ts"

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
  hasPendingImport: () => Promise<{ pending: boolean }>
  addListener: (
    eventName: "sharedImport",
    listenerFunc: (payload: NativeOpenPayload) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
}

ensureCapacitorNativePluginHeader({
  name: "SharedImport",
  methods: [
    { name: "getPendingImport", rtype: "promise" },
    { name: "hasPendingImport", rtype: "promise" },
    { name: "addListener", rtype: "callback" },
    { name: "removeListener", rtype: "callback" },
  ],
})

const SharedImport = registerCapacitorPluginOnce<SharedImportPlugin>("SharedImport", () =>
  registerPlugin<SharedImportPlugin>("SharedImport"),
)
const listeners = new Set<(payload: SharedImportPayload) => void>()

let pendingImport: SharedImportPayload | null = null

function isSharedImportPayload(payload?: NativeOpenPayload | null): payload is SharedImportPayload {
  return Boolean(payload && "text" in payload && payload.text.trim())
}

function isNativeLinkPayload(payload?: NativeOpenPayload | null): payload is Extract<NativeOpenPayload, { url: string }> {
  return Boolean(payload && "url" in payload && payload.url.trim())
}

function receiveSharedImport(payload: SharedImportPayload) {
  if (listeners.size === 0) {
    pendingImport = payload
    return
  }

  pendingImport = null
  for (const listener of listeners) listener(payload)
}

export function receiveNativeOpenPayload(
  payload: NativeOpenPayload | null | undefined,
  onOpen: (payload: NativeOpenPayload) => void,
) {
  if (isSharedImportPayload(payload)) {
    receiveSharedImport(payload)
    onOpen(payload)
    return true
  }

  if (isNativeLinkPayload(payload)) {
    onOpen(payload)
    return true
  }

  return false
}

export function takeSharedImport() {
  const payload = pendingImport
  pendingImport = null
  return payload
}

export async function takePendingNativeSharedImport() {
  const payload = takeSharedImport()
  if (payload) return payload
  if (!Capacitor.isNativePlatform()) return null

  try {
    const result = await SharedImport.getPendingImport()
    return isSharedImportPayload(result.import) ? result.import : null
  } catch {
    // Native bridge is unavailable in browsers, old Android shells, or disallowed origins.
    return null
  }
}

export function subscribeSharedImport(listener: (payload: SharedImportPayload) => void) {
  listeners.add(listener)

  const payload = takeSharedImport()
  if (payload) listener(payload)

  return () => {
    listeners.delete(listener)
  }
}

export async function initializeNativeSharedImport(onOpen: (payload: NativeOpenPayload) => void) {
  if (!Capacitor.isNativePlatform()) return

  const receive = (payload?: NativeOpenPayload | null) => {
    receiveNativeOpenPayload(payload, onOpen)
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
