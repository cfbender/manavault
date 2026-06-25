export const COLLECTION_STATE_STORAGE_PREFIX = "manavault.collection"
export const COLLECTION_ACTIVE_TAB_STORAGE_KEY = `${COLLECTION_STATE_STORAGE_PREFIX}.activeTab`
export const COLLECTION_SEARCH_DRAFT_STORAGE_KEY = `${COLLECTION_STATE_STORAGE_PREFIX}.searchDraft`
export const COLLECTION_APPLIED_SEARCH_STORAGE_KEY = `${COLLECTION_STATE_STORAGE_PREFIX}.appliedSearch`
export const COLLECTION_SORT_STORAGE_KEY = `${COLLECTION_STATE_STORAGE_PREFIX}.sort`
export const COLLECTION_FILTERS_STORAGE_KEY = `${COLLECTION_STATE_STORAGE_PREFIX}.filters`
export const COLLECTION_LOCATION_STATE_STORAGE_PREFIX = `${COLLECTION_STATE_STORAGE_PREFIX}.location`

export type CollectionSortStorageScope = "collection" | "location"

export function collectionSortStorageKey(_scope: CollectionSortStorageScope) {
  return COLLECTION_SORT_STORAGE_KEY
}

export function collectionLocationStateStoragePrefix(id: string) {
  return `${COLLECTION_LOCATION_STATE_STORAGE_PREFIX}.${encodeURIComponent(id)}`
}
