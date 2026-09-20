// Compatibility exports for feature consumers outside collection/. New collection code
// imports directly from the feature-owned document modules.
export { AutoSortCollectionDocument } from "./auto-sort/documents"
export {
  CollectionItemFormOptionsDocument,
  CollectionItemGroupsPageDocument,
  CreateCollectionItemDocument,
} from "./items/documents"
