type CapacitorPluginMethodReturn = "promise" | "callback"

type CapacitorPluginMethodHeader = {
  name: string
  rtype?: CapacitorPluginMethodReturn
}

export type CapacitorPluginHeader = {
  name: string
  methods: CapacitorPluginMethodHeader[]
}

type CapacitorBridgeGlobal = typeof globalThis & {
  Capacitor?: {
    PluginHeaders?: CapacitorPluginHeader[]
  }
  androidBridge?: unknown
  webkit?: {
    messageHandlers?: {
      bridge?: unknown
    }
  }
}

function hasNativeBridge(global: CapacitorBridgeGlobal) {
  return Boolean(global.androidBridge || global.webkit?.messageHandlers?.bridge)
}

export function ensureCapacitorNativePluginHeader(header: CapacitorPluginHeader) {
  const global = globalThis as CapacitorBridgeGlobal
  if (!hasNativeBridge(global) || !global.Capacitor) return

  const headers = Array.isArray(global.Capacitor.PluginHeaders)
    ? global.Capacitor.PluginHeaders
    : []

  if (headers.some((existingHeader) => existingHeader.name === header.name)) return

  global.Capacitor.PluginHeaders = [...headers, header]
}
