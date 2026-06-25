import test from "node:test"
import assert from "node:assert/strict"

import {
  COLLECTION_SORT_STORAGE_KEY,
  collectionLocationStateStoragePrefix,
  collectionSortStorageKey,
} from "../src/pages/collection/storage-keys.ts"

test("collection and location views share the last sort storage key", () => {
  assert.equal(collectionSortStorageKey("collection"), COLLECTION_SORT_STORAGE_KEY)
  assert.equal(collectionSortStorageKey("location"), COLLECTION_SORT_STORAGE_KEY)
})

test("location scoped storage does not include sort state", () => {
  const locationPrefix = collectionLocationStateStoragePrefix("binder/one")

  assert.equal(locationPrefix, "manavault.collection.location.binder%2Fone")
  assert.notEqual(collectionSortStorageKey("location"), `${locationPrefix}.sort`)
})
