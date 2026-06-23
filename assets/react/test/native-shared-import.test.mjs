import test from "node:test"
import assert from "node:assert/strict"

import {
  receiveNativeOpenPayload,
  subscribeSharedImport,
  takeSharedImport,
} from "../src/lib/native-shared-import.ts"
import {
  ensureCapacitorNativePluginHeader,
  registerCapacitorPluginOnce,
} from "../src/lib/capacitor-native-headers.ts"

function withCapacitorGlobals(globals, callback) {
  const hadCapacitor = Object.prototype.hasOwnProperty.call(globalThis, "Capacitor")
  const hadAndroidBridge = Object.prototype.hasOwnProperty.call(globalThis, "androidBridge")
  const previousCapacitor = globalThis.Capacitor
  const previousAndroidBridge = globalThis.androidBridge

  try {
    if ("Capacitor" in globals) globalThis.Capacitor = globals.Capacitor
    else delete globalThis.Capacitor

    if ("androidBridge" in globals) globalThis.androidBridge = globals.androidBridge
    else delete globalThis.androidBridge

    callback()
  } finally {
    if (hadCapacitor) globalThis.Capacitor = previousCapacitor
    else delete globalThis.Capacitor

    if (hadAndroidBridge) globalThis.androidBridge = previousAndroidBridge
    else delete globalThis.androidBridge
  }
}

test("ensureCapacitorNativePluginHeader adds native plugin headers once", () => {
  withCapacitorGlobals(
    {
      androidBridge: {},
      Capacitor: { nativePromise() {}, PluginHeaders: [{ name: "Existing", methods: [] }] },
    },
    () => {
      const header = {
        name: "SharedImport",
        methods: [{ name: "getPendingImport", rtype: "promise" }],
      }

      ensureCapacitorNativePluginHeader(header)
      ensureCapacitorNativePluginHeader(header)

      assert.deepEqual(globalThis.Capacitor.PluginHeaders, [
        { name: "Existing", methods: [] },
        header,
      ])
    },
  )
})

test("ensureCapacitorNativePluginHeader leaves incomplete native bridge globals untouched", () => {
  withCapacitorGlobals(
    {
      androidBridge: {},
      Capacitor: {},
    },
    () => {
      ensureCapacitorNativePluginHeader({
        name: "SharedImport",
        methods: [{ name: "getPendingImport", rtype: "promise" }],
      })

      assert.equal(globalThis.Capacitor.PluginHeaders, undefined)
    },
  )
})

test("ensureCapacitorNativePluginHeader leaves browser globals untouched", () => {
  withCapacitorGlobals({ Capacitor: {} }, () => {
    ensureCapacitorNativePluginHeader({
      name: "SharedImport",
      methods: [{ name: "getPendingImport", rtype: "promise" }],
    })

    assert.equal(globalThis.Capacitor.PluginHeaders, undefined)
  })
})

test("registerCapacitorPluginOnce reuses existing native plugin proxies", () => {
  const existing = { getPendingImport() {} }

  withCapacitorGlobals({ Capacitor: { Plugins: { SharedImport: existing } } }, () => {
    const plugin = registerCapacitorPluginOnce("SharedImport", () => {
      throw new Error("registerPlugin should not run for an existing plugin")
    })

    assert.equal(plugin, existing)
  })
})


const sharedPayload = {
  text: "1 Lightning Bolt",
  fileName: "manabox.txt",
  mimeType: "text/plain",
  source: "android-share",
}

test("receiveNativeOpenPayload stores shared imports until the collection route consumes them", () => {
  const opened = []

  assert.equal(receiveNativeOpenPayload(sharedPayload, (payload) => opened.push(payload)), true)
  assert.deepEqual(opened, [sharedPayload])
  assert.deepEqual(takeSharedImport(), sharedPayload)
  assert.equal(takeSharedImport(), null)
})

test("subscribeSharedImport immediately delivers a pending shared import", () => {
  const opened = []
  const delivered = []

  receiveNativeOpenPayload(sharedPayload, (payload) => opened.push(payload))
  const unsubscribe = subscribeSharedImport((payload) => delivered.push(payload))
  unsubscribe()

  assert.deepEqual(opened, [sharedPayload])
  assert.deepEqual(delivered, [sharedPayload])
  assert.equal(takeSharedImport(), null)
})

test("receiveNativeOpenPayload sends active subscribers without leaving stale pending imports", () => {
  const opened = []
  const delivered = []
  const unsubscribe = subscribeSharedImport((payload) => delivered.push(payload))

  assert.equal(receiveNativeOpenPayload(sharedPayload, (payload) => opened.push(payload)), true)
  unsubscribe()

  assert.deepEqual(opened, [sharedPayload])
  assert.deepEqual(delivered, [sharedPayload])
  assert.equal(takeSharedImport(), null)
})

test("receiveNativeOpenPayload routes native links without creating a shared import", () => {
  const linkPayload = { url: "https://manavault.cfb.dev/collection", source: "android-view" }
  const opened = []

  assert.equal(receiveNativeOpenPayload(linkPayload, (payload) => opened.push(payload)), true)

  assert.deepEqual(opened, [linkPayload])
  assert.equal(takeSharedImport(), null)
})
