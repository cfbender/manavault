import test from "node:test"
import assert from "node:assert/strict"

import {
  receiveNativeOpenPayload,
  subscribeSharedImport,
  takeSharedImport,
} from "../src/lib/native-shared-import.ts"

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
