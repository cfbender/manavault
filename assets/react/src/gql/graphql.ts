/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type CollectionItemFilters = {
  condition?: string | null | undefined;
  finish?: string | null | undefined;
  language?: string | null | undefined;
  locationId?: string | number | null | undefined;
  q?: string | null | undefined;
};

export type CollectionItemSort = {
  direction?: string | null | undefined;
  field?: string | null | undefined;
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


export type CardsQuery = { cards: Array<{ oracleId: string, name: string, typeLine: string | null, manaCost: string | null, printings: Array<{ scryfallId: string, setCode: string | null, collectorNumber: string | null, imageUrl: string | null } | null> | null }> };

export type CardQueryVariables = Exact<{
  id: string | number;
}>;


export type CardQuery = { card: { oracleId: string, name: string, typeLine: string | null, manaCost: string | null, oracleText: string | null, colorIdentity: Array<string | null> | null, printings: Array<{ scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, lang: string | null, rarity: string | null, finishes: Array<string | null> | null, imageUrl: string | null, releasedAt: string | null, prices: unknown } | null> | null } | null };

export type CollectionQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
}>;


export type CollectionQuery = { collectionItemCount: number, locations: Array<{ id: string, name: string, kind: string, itemCount: number | null, totalPriceText: string | null, coverPrinting: { artCropUrl: string | null } | null }> };

export type LocationQueryVariables = Exact<{
  id: string | number;
}>;


export type LocationQuery = { location: { id: string, name: string, kind: string, description: string | null, itemCount: number | null, totalPriceText: string | null, coverPrinting: { artCropUrl: string | null } | null } | null };

export type LocationCollectionCountQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
}>;


export type LocationCollectionCountQuery = { collectionItemCount: number };

export type CollectionItemsPageQueryVariables = Exact<{
  filters?: CollectionItemFilters | null | undefined;
  sort?: CollectionItemSort | null | undefined;
  limit: number;
  offset: number;
}>;


export type CollectionItemsPageQuery = { collectionItems: Array<{ id: string, quantity: number, condition: string, language: string, finish: string, priceText: string | null, allocatedQuantity: number, location: { id: string, name: string } | null, printing: { scryfallId: string, setCode: string | null, setName: string | null, collectorNumber: string | null, imageUrl: string | null, rarity: string | null, card: { oracleId: string, name: string, typeLine: string | null } | null } | null }> };

export type DecksQueryVariables = Exact<{ [key: string]: never; }>;


export type DecksQuery = { decks: Array<{ id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ preferredPrinting: { imageUrl: string | null } | null, card: { printings: Array<{ imageUrl: string | null } | null> | null } | null } | null> | null }> };

export type DeckQueryVariables = Exact<{
  id: string | number;
}>;


export type DeckQuery = { deck: { id: string, name: string, format: string, status: string, cardCount: number | null, uniqueCardCount: number | null, deckCards: Array<{ id: string, quantity: number, zone: string | null, finish: string | null, card: { oracleId: string, name: string, typeLine: string | null, printings: Array<{ imageUrl: string | null } | null> | null } | null, preferredPrinting: { imageUrl: string | null, setCode: string | null, collectorNumber: string | null } | null } | null> | null } | null };

export type HomeQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeQuery = { homeSummary: { collectionCount: number, locationCount: number, deckCount: number, scanSessionCount: number } };

export type ScanSessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type ScanSessionsQuery = { scanSessions: Array<{ id: string, name: string, defaultCondition: string, defaultLanguage: string, defaultFinish: string, itemCount: number | null, reviewCount: number | null, createdAt: string | null }> };


export const CardNameSuggestionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CardNameSuggestions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cardNameSuggestions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}]}]}}]} as unknown as DocumentNode<CardNameSuggestionsQuery, CardNameSuggestionsQueryVariables>;
export const CardsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Cards"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cards"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"manaCost"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}}]}}]}}]} as unknown as DocumentNode<CardsQuery, CardsQueryVariables>;
export const CardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Card"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"card"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"manaCost"}},{"kind":"Field","name":{"kind":"Name","value":"oracleText"}},{"kind":"Field","name":{"kind":"Name","value":"colorIdentity"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"lang"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"finishes"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"releasedAt"}},{"kind":"Field","name":{"kind":"Name","value":"prices"}}]}}]}}]}}]} as unknown as DocumentNode<CardQuery, CardQueryVariables>;
export const CollectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Collection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"locations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"collectionItemCount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}]}]}}]} as unknown as DocumentNode<CollectionQuery, CollectionQueryVariables>;
export const LocationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Location"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"location"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"totalPriceText"}},{"kind":"Field","name":{"kind":"Name","value":"coverPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"artCropUrl"}}]}}]}}]}}]} as unknown as DocumentNode<LocationQuery, LocationQueryVariables>;
export const LocationCollectionCountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LocationCollectionCount"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionItemCount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}}]}]}}]} as unknown as DocumentNode<LocationCollectionCountQuery, LocationCollectionCountQueryVariables>;
export const CollectionItemsPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CollectionItemsPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemFilters"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sort"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CollectionItemSort"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionItems"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sort"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"priceText"}},{"kind":"Field","name":{"kind":"Name","value":"allocatedQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"printing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scryfallId"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"setName"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}}]}}]}}]}}]}}]} as unknown as DocumentNode<CollectionItemsPageQuery, CollectionItemsPageQueryVariables>;
export const DecksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Decks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"decks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<DecksQuery, DecksQueryVariables>;
export const DeckDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Deck"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deck"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"cardCount"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCardCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"zone"}},{"kind":"Field","name":{"kind":"Name","value":"finish"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"oracleId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeLine"}},{"kind":"Field","name":{"kind":"Name","value":"printings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"preferredPrinting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"setCode"}},{"kind":"Field","name":{"kind":"Name","value":"collectorNumber"}}]}}]}}]}}]}}]} as unknown as DocumentNode<DeckQuery, DeckQueryVariables>;
export const HomeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Home"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"homeSummary"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"collectionCount"}},{"kind":"Field","name":{"kind":"Name","value":"locationCount"}},{"kind":"Field","name":{"kind":"Name","value":"deckCount"}},{"kind":"Field","name":{"kind":"Name","value":"scanSessionCount"}}]}}]}}]} as unknown as DocumentNode<HomeQuery, HomeQueryVariables>;
export const ScanSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ScanSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scanSessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"defaultCondition"}},{"kind":"Field","name":{"kind":"Name","value":"defaultLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"defaultFinish"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"reviewCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ScanSessionsQuery, ScanSessionsQueryVariables>;