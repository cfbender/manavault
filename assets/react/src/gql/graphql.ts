/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type CollectionImportAttrsInput = {
  collectorNumber?: string | null | undefined;
  condition?: string | null | undefined;
  finish?: string | null | undefined;
  language?: string | null | undefined;
  locationId?: string | number | null | undefined;
  name?: string | null | undefined;
  quantity?: number | null | undefined;
  scryfallId?: string | number | null | undefined;
  setCode?: string | null | undefined;
};

export type CollectionImportCommitInput = {
  rows: Array<CollectionImportRowInput>;
};

export type CollectionImportPreviewInput = {
  csv: string;
  locationId?: string | number | null | undefined;
};

export type CollectionImportRowInput = {
  attrs: CollectionImportAttrsInput;
  rowNumber: number;
  status: string;
};

export type CollectionItemFilters = {
  condition?: string | null | undefined;
  finish?: string | null | undefined;
  language?: string | null | undefined;
  locationId?: string | number | null | undefined;
  q?: string | null | undefined;
};

export type CollectionItemInput = {
  condition?: string | null | undefined;
  finish?: string | null | undefined;
  language?: string | null | undefined;
  locationId?: string | number | null | undefined;
  notes?: string | null | undefined;
  quantity?: number | null | undefined;
  scryfallId: string | number;
};

export type CollectionItemSort = {
  direction?: string | null | undefined;
  field?: string | null | undefined;
};

export type CollectionItemUpdateInput = {
  condition?: string | null | undefined;
  finish?: string | null | undefined;
  language?: string | null | undefined;
  locationId?: string | number | null | undefined;
  notes?: string | null | undefined;
  quantity?: number | null | undefined;
};

export type DeckCardUpdateInput = {
  finish?: string | null | undefined;
  preferredPrintingId?: string | number | null | undefined;
  quantity?: number | null | undefined;
  zone?: string | null | undefined;
};

export type DeckInput = {
  format?: string | null | undefined;
  name: string;
  status?: string | null | undefined;
};

export type DeckUpdateInput = {
  format?: string | null | undefined;
  name?: string | null | undefined;
  status?: string | null | undefined;
};

export type LocationInput = {
  coverScryfallId?: string | number | null | undefined;
  description?: string | null | undefined;
  kind?: string | null | undefined;
  name: string;
};

export type LocationUpdateInput = {
  coverScryfallId?: string | number | null | undefined;
  description?: string | null | undefined;
  kind?: string | null | undefined;
  name?: string | null | undefined;
};

export type CardNameSuggestionsQueryVariables = Exact<{
  q: string;
  limit: number;
}>;


export type CardNameSuggestionsQuery = { cardNameSuggestions: Array<string> };

export type CardsQueryVariables = Exact<{
  q: string;
  limit: number;
}>;


export type CardsQuery = { cards: Array<{ oracleId: string, name: string, typeLine: string | null, manaCost: string | null, printings: Array<{ scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null } | null> | null }> };

export type CardQueryVariables = Exact<{
  id: string | number;
}>;


export type CardQuery = { card: { oracleId: string, name: string, typeLine: string | null, manaCost: string | null, oracleText: string | null, colorIdentity: Array<string | null> | null, printings: Array<{ scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, lang: string | null, rarity: string | null, finishes: Array<string | null> | null, imageUrl: string | null, artCropUrl: string | null, releasedAt: string | null, prices: unknown } | null> | null } | null };

export type CollectionQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
}>;


export type CollectionQuery = { collectionItemCount: number, locations: Array<{ id: string, name: string, kind: string, description: string | null, itemCount: number | null, totalPriceText: string | null, coverPrinting: { scryfallId: string, artCropUrl: string | null } | null }> };

export type LocationQueryVariables = Exact<{
  id: string | number;
}>;


export type LocationQuery = { location: { id: string, name: string, kind: string, description: string | null, itemCount: number | null, totalPriceText: string | null, coverPrinting: { scryfallId: string, artCropUrl: string | null } | null } | null };

export type LocationCollectionCountQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
}>;


export type LocationCollectionCountQuery = { collectionItemCount: number };

export type LocationCoverCardSearchQueryVariables = Exact<{
  q: string;
  limit: number;
}>;


export type LocationCoverCardSearchQuery = { cards: Array<{ oracleId: string, name: string, typeLine: string | null, printings: Array<{ scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, finishes: Array<string | null> | null, imageUrl: string | null, artCropUrl: string | null, rarity: string | null } | null> | null }> };

export type CollectionItemFormOptionsQueryVariables = Exact<{ [key: string]: never; }>;


export type CollectionItemFormOptionsQuery = { locations: Array<{ id: string, name: string, kind: string }> };

export type CollectionItemDeckOptionsQueryVariables = Exact<{ [key: string]: never; }>;


export type CollectionItemDeckOptionsQuery = { decks: Array<{ id: string, name: string, format: string, status: string }> };

export type CreateCollectionItemMutationVariables = Exact<{
  input: CollectionItemInput;
}>;


export type CreateCollectionItemMutation = { createCollectionItem: { id: string, quantity: number, condition: string, language: string, finish: string, notes: string | null, priceText: string | null, allocatedQuantity: number, location: { id: string, name: string } | null, printing: { scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null } | null } | null };

export type UpdateCollectionItemMutationVariables = Exact<{
  id: string | number;
  input: CollectionItemUpdateInput;
}>;


export type UpdateCollectionItemMutation = { updateCollectionItem: { id: string, quantity: number, condition: string, language: string, finish: string, notes: string | null, priceText: string | null, allocatedQuantity: number, location: { id: string, name: string } | null, printing: { scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null } | null } | null };

export type DeleteCollectionItemMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteCollectionItemMutation = { deleteCollectionItem: { id: string } | null };

export type AddCollectionItemToDeckMutationVariables = Exact<{
  id: string | number;
  deckId: string | number;
  zone?: string | null | undefined;
}>;


export type AddCollectionItemToDeckMutation = { addCollectionItemToDeck: { id: string, quantity: number, zone: string | null, finish: string | null, card: { oracleId: string, name: string } | null, preferredPrinting: { scryfallId: string, setCode: string | null, collectorNumber: string | null, imageUrl: string | null } | null } | null };

export type CreateLocationMutationVariables = Exact<{
  input: LocationInput;
}>;


export type CreateLocationMutation = { createLocation: { id: string, name: string, kind: string, description: string | null, itemCount: number | null, totalPriceText: string | null, coverPrinting: { scryfallId: string, artCropUrl: string | null } | null } | null };

export type UpdateLocationMutationVariables = Exact<{
  id: string | number;
  input: LocationUpdateInput;
}>;


export type UpdateLocationMutation = { updateLocation: { id: string, name: string, kind: string, description: string | null, itemCount: number | null, totalPriceText: string | null, coverPrinting: { scryfallId: string, artCropUrl: string | null } | null } | null };

export type CollectionItemsPageQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
  sort?: CollectionItemSort | null | undefined;
  limit: number;
  offset: number;
}>;


export type CollectionItemsPageQuery = { collectionItems: Array<{ id: string, quantity: number, condition: string, language: string, finish: string, notes: string | null, priceText: string | null, allocatedQuantity: number, location: { id: string, name: string } | null, printing: { scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null } | null }> };

export type CollectionExportCsvQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
}>;


export type CollectionExportCsvQuery = { collectionExportCsv: string };

export type PreviewCollectionImportMutationVariables = Exact<{
  input: CollectionImportPreviewInput;
}>;


export type PreviewCollectionImportMutation = { previewCollectionImport: { locationId: string | null, total: number, exact: number, ambiguous: number, unresolved: number, rows: Array<{ rowNumber: number, status: string, attrs: { name: string | null, setCode: string | null, collectorNumber: string | null, quantity: number | null, finish: string | null, condition: string | null, language: string | null, scryfallId: string | null, locationId: string | null }, printing: { scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null } | null, candidates: Array<{ scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null }> }> } | null };

export type CommitCollectionImportMutationVariables = Exact<{
  input: CollectionImportCommitInput;
}>;


export type CommitCollectionImportMutation = { commitCollectionImport: { imported: number, skipped: number } | null };

export type DecksQueryVariables = Exact<{ [key: string]: never; }>;


export type DecksQuery = { decks: Array<{ id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ preferredPrinting: { imageUrl: string | null, artCropUrl: string | null } | null, card: { printings: Array<{ imageUrl: string | null, artCropUrl: string | null } | null> | null } | null } | null> | null }> };

export type CreateDeckMutationVariables = Exact<{
  input: DeckInput;
}>;


export type CreateDeckMutation = { createDeck: { id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ preferredPrinting: { imageUrl: string | null, artCropUrl: string | null } | null, card: { printings: Array<{ imageUrl: string | null, artCropUrl: string | null } | null> | null } | null } | null> | null } | null };

export type UpdateDeckMutationVariables = Exact<{
  id: string | number;
  input: DeckUpdateInput;
}>;


export type UpdateDeckMutation = { updateDeck: { id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ preferredPrinting: { imageUrl: string | null, artCropUrl: string | null } | null, card: { printings: Array<{ imageUrl: string | null, artCropUrl: string | null } | null> | null } | null } | null> | null } | null };

export type DeckQueryVariables = Exact<{
  id: string | number;
}>;


export type DeckQuery = { deck: { id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ id: string, quantity: number, zone: string | null, finish: string | null, card: { oracleId: string, name: string, typeLine: string | null, cmc: number | null, colors: Array<string | null> | null, colorIdentity: Array<string | null> | null, printings: Array<{ imageUrl: string | null, artCropUrl: string | null, setCode: string | null, setName: string | null, collectorNumber: string | null, rarity: string | null } | null> | null } | null, preferredPrinting: { imageUrl: string | null, artCropUrl: string | null, setCode: string | null, setName: string | null, collectorNumber: string | null, rarity: string | null } | null } | null> | null } | null };

export type UpdateDeckCardMutationVariables = Exact<{
  id: string | number;
  input: DeckCardUpdateInput;
}>;


export type UpdateDeckCardMutation = { updateDeckCard: { id: string, quantity: number, zone: string | null, finish: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null, preferredPrinting: { imageUrl: string | null, artCropUrl: string | null, setCode: string | null, setName: string | null, collectorNumber: string | null, rarity: string | null } | null } | null };

export type SetDeckCommanderMutationVariables = Exact<{
  id: string | number;
}>;


export type SetDeckCommanderMutation = { setDeckCommander: { id: string, quantity: number, zone: string | null, finish: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null, preferredPrinting: { imageUrl: string | null, artCropUrl: string | null, setCode: string | null, setName: string | null, collectorNumber: string | null, rarity: string | null } | null } | null };

export type ImportDecklistMutationVariables = Exact<{
  id: string | number;
  text: string;
}>;


export type ImportDecklistMutation = { importDecklist: { imported: number, unresolved: Array<string>, skippedPrintings: Array<string> } | null };

export type DeckExportTextQueryVariables = Exact<{
  id: string | number;
}>;


export type DeckExportTextQuery = { deckExportText: string };

export type HomeQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeQuery = { homeSummary: { collectionCount: number, locationCount: number, deckCount: number, scanSessionCount: number } };

export type ScanSessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type ScanSessionsQuery = { scanSessions: Array<{ id: string, name: string, defaultCondition: string, defaultLanguage: string, defaultFinish: string, itemCount: number | null, reviewCount: number | null, createdAt: string | null }> };


export const CardNameSuggestionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CardNameSuggestions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cardNameSuggestions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}]}]}}]} as unknown as DocumentNode<CardNameSuggestionsQuery, CardNameSuggestionsQueryVariables>;
export const CardsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Cards"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cards"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"manaCost"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]} as unknown as DocumentNode<CardsQuery, CardsQueryVariables>;
export const CardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Card"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"card"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"manaCost"}},{"kind":"Field","name":{"kind":"Name","value":"oracleText"}},{"kind":"Field","name":{"kind":"Name","value":"colorIdentity"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"lang"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"finishes"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"releasedAt"}},{"kind":"Field","name":{"kind":"Name","value":"prices"}}]}}]}}]}}]} as unknown as DocumentNode<CardQuery, CardQueryVariables>;
export const CollectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Collection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"locations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"collectionItemCount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}]}]}}]} as unknown as DocumentNode<CollectionQuery, CollectionQueryVariables>;
export const LocationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Location"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"location"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]} as unknown as DocumentNode<LocationQuery, LocationQueryVariables>;
export const LocationCollectionCountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LocationCollectionCount"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionItemCount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}]}]}}]} as unknown as DocumentNode<LocationCollectionCountQuery, LocationCollectionCountQueryVariables>;
export const LocationCoverCardSearchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LocationCoverCardSearch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cards"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"finishes"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]} as unknown as DocumentNode<LocationCoverCardSearchQuery, LocationCoverCardSearchQueryVariables>;
export const CollectionItemFormOptionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CollectionItemFormOptions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"locations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}}]}}]}}]} as unknown as DocumentNode<CollectionItemFormOptionsQuery, CollectionItemFormOptionsQueryVariables>;
export const CollectionItemDeckOptionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CollectionItemDeckOptions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"decks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<CollectionItemDeckOptionsQuery, CollectionItemDeckOptionsQueryVariables>;
export const CreateCollectionItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCollectionItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCollectionItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"notes"}},{"kind":"Field","name":{"kind":"Name","value":"priceText"}},{"kind":"Field","name":{"kind":"Name","value":"allocatedQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"printing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}}]}}]}}]} as unknown as DocumentNode<CreateCollectionItemMutation, CreateCollectionItemMutationVariables>;
export const UpdateCollectionItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCollectionItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateCollectionItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"notes"}},{"kind":"Field","name":{"kind":"Name","value":"priceText"}},{"kind":"Field","name":{"kind":"Name","value":"allocatedQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"printing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}}]}}]}}]} as unknown as DocumentNode<UpdateCollectionItemMutation, UpdateCollectionItemMutationVariables>;
export const DeleteCollectionItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteCollectionItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteCollectionItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DeleteCollectionItemMutation, DeleteCollectionItemMutationVariables>;
export const AddCollectionItemToDeckDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCollectionItemToDeck"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"deckId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"zone"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addCollectionItemToDeck"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"deckId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"deckId"}}},{"kind":"Argument","name":{"kind":"Name","value":"zone"},"value":{"kind":"Variable","name":{"kind":"Name","value":"zone"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"zone"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}}]}}]}}]} as unknown as DocumentNode<AddCollectionItemToDeckMutation, AddCollectionItemToDeckMutationVariables>;
export const CreateLocationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateLocation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LocationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createLocation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]} as unknown as DocumentNode<CreateLocationMutation, CreateLocationMutationVariables>;
export const UpdateLocationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateLocation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LocationUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateLocation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateLocationMutation, UpdateLocationMutationVariables>;
export const CollectionItemsPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CollectionItemsPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sort"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemSort"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionItems"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sort"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"notes"}},{"kind":"Field","name":{"kind":"Name","value":"priceText"}},{"kind":"Field","name":{"kind":"Name","value":"allocatedQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"printing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}}]}}]}}]} as unknown as DocumentNode<CollectionItemsPageQuery, CollectionItemsPageQueryVariables>;
export const CollectionExportCsvDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CollectionExportCsv"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionExportCsv"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}]}]}}]} as unknown as DocumentNode<CollectionExportCsvQuery, CollectionExportCsvQueryVariables>;
export const PreviewCollectionImportDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PreviewCollectionImport"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionImportPreviewInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"previewCollectionImport"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"locationId"}},{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"exact"}},{"kind":"Field","name":{"kind":"Name","value":"ambiguous"}},{"kind":"Field","name":{"kind":"Name","value":"unresolved"}},{"kind":"Field","name":{"kind":"Name","value":"rows"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rowNumber"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"attrs"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"locationId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"printing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"candidates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<PreviewCollectionImportMutation, PreviewCollectionImportMutationVariables>;
export const CommitCollectionImportDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CommitCollectionImport"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionImportCommitInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"commitCollectionImport"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imported"}},{"kind":"Field","name":{"kind":"Name","value":"skipped"}}]}}]}}]} as unknown as DocumentNode<CommitCollectionImportMutation, CommitCollectionImportMutationVariables>;
export const DecksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Decks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"decks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<DecksQuery, DecksQueryVariables>;
export const CreateDeckDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateDeck"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DeckInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createDeck"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<CreateDeckMutation, CreateDeckMutationVariables>;
export const UpdateDeckDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateDeck"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DeckUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateDeck"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<UpdateDeckMutation, UpdateDeckMutationVariables>;
export const DeckDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Deck"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deck"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"zone"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"cmc"}},{"kind":"Field","name":{"kind":"Name","value":"colors"}},{"kind":"Field","name":{"kind":"Name","value":"colorIdentity"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]}}]} as unknown as DocumentNode<DeckQuery, DeckQueryVariables>;
export const UpdateDeckCardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateDeckCard"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DeckCardUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateDeckCard"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"zone"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}},{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateDeckCardMutation, UpdateDeckCardMutationVariables>;
export const SetDeckCommanderDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetDeckCommander"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setDeckCommander"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"zone"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}},{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]} as unknown as DocumentNode<SetDeckCommanderMutation, SetDeckCommanderMutationVariables>;
export const ImportDecklistDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImportDecklist"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"importDecklist"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imported"}},{"kind":"Field","name":{"kind":"Name","value":"unresolved"}},{"kind":"Field","name":{"kind":"Name","value":"skippedPrintings"}}]}}]}}]} as unknown as DocumentNode<ImportDecklistMutation, ImportDecklistMutationVariables>;
export const DeckExportTextDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"DeckExportText"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deckExportText"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeckExportTextQuery, DeckExportTextQueryVariables>;
export const HomeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Home"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"homeSummary"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionCount"}},{"kind":"Field","name":{"kind":"Name","value":"locationCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCount"}},{"kind":"Field","name":{"kind":"Name","value":"scanSessionCount"}}]}}]}}]} as unknown as DocumentNode<HomeQuery, HomeQueryVariables>;
export const ScanSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ScanSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scanSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"defaultCondition"}},{"kind":"Field","name":{"kind":"Name","value":"defaultLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"defaultFinish"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"reviewCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ScanSessionsQuery, ScanSessionsQueryVariables>;