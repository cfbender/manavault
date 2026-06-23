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
    nativeCallback?: unknown
    nativePromise?: unknown
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

function hasRequiredNativeMethods(
  capacitor: NonNullable<CapacitorBridgeGlobal["Capacitor"]>,
  header: CapacitorPluginHeader,
) {
  return header.methods.every((method) => {
    const returnType = method.rtype ?? "promise"

    if (returnType === "promise") return typeof capacitor.nativePromise === "function"
    return typeof capacitor.nativeCallback === "function"
  })
}

export function ensureCapacitorNativePluginHeader(header: CapacitorPluginHeader) {
  const global = globalThis as CapacitorBridgeGlobal
  if (!hasNativeBridge(global) || !global.Capacitor || !hasRequiredNativeMethods(global.Capacitor, header)) return

  const headers = Array.isArray(global.Capacitor.PluginHeaders)
    ? global.Capacitor.PluginHeaders
    : []

  if (headers.some((existingHeader) => existingHeader.name === header.name)) return

  global.Capacitor.PluginHeaders = [...headers, header]
}
