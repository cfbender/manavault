/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query CardNameSuggestions($q: String!, $limit: Int!) {\n    cardNameSuggestions(q: $q, limit: $limit)\n  }\n": typeof types.CardNameSuggestionsDocument,
    "\n  query Cards($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n      }\n    }\n  }\n": typeof types.CardsDocument,
    "\n  query Card($id: ID!) {\n    card(id: $id) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      oracleText\n      colorIdentity\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        lang\n        rarity\n        finishes\n        imageUrl\n        artCropUrl\n        releasedAt\n        prices\n      }\n    }\n  }\n": typeof types.CardDocument,
    "\n  query Collection($filters: CollectionItemFilters) {\n    locations {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n    collectionItemCount(filters: $filters)\n  }\n": typeof types.CollectionDocument,
    "\n  query Location($id: ID!) {\n    location(id: $id) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n": typeof types.LocationDocument,
    "\n  query LocationCollectionCount($filters: CollectionItemFilters) {\n    collectionItemCount(filters: $filters)\n  }\n": typeof types.LocationCollectionCountDocument,
    "\n  query LocationCoverCardSearch($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        artCropUrl\n        rarity\n      }\n    }\n  }\n": typeof types.LocationCoverCardSearchDocument,
    "\n  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {\n    updateLocation(id: $id, input: $input) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n": typeof types.UpdateLocationDocument,
    "\n  query CollectionItemsPage($filters: CollectionItemFilters, $sort: CollectionItemSort, $limit: Int!, $offset: Int!) {\n    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {\n      id\n      quantity\n      condition\n      language\n      finish\n      priceText\n      allocatedQuantity\n      location { id name }\n      printing {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n        card { oracleId name typeLine }\n      }\n    }\n  }\n": typeof types.CollectionItemsPageDocument,
    "\n  query Decks {\n    decks {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": typeof types.DecksDocument,
    "\n  mutation CreateDeck($input: DeckInput!) {\n    createDeck(input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": typeof types.CreateDeckDocument,
    "\n  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {\n    updateDeck(id: $id, input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": typeof types.UpdateDeckDocument,
    "\n  query Deck($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        id\n        quantity\n        zone\n        finish\n        card {\n          oracleId\n          name\n          typeLine\n          cmc\n          colors\n          colorIdentity\n          printings { imageUrl artCropUrl setCode setName collectorNumber rarity }\n        }\n        preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n      }\n    }\n  }\n": typeof types.DeckDocument,
    "\n  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {\n    updateDeckCard(id: $id, input: $input) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n": typeof types.UpdateDeckCardDocument,
    "\n  mutation SetDeckCommander($id: ID!) {\n    setDeckCommander(id: $id) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n": typeof types.SetDeckCommanderDocument,
    "\n  query Home {\n    homeSummary {\n      collectionCount\n      locationCount\n      deckCount\n      scanSessionCount\n    }\n  }\n": typeof types.HomeDocument,
    "\n  query ScanSessions {\n    scanSessions {\n      id\n      name\n      defaultCondition\n      defaultLanguage\n      defaultFinish\n      itemCount\n      reviewCount\n      createdAt\n    }\n  }\n": typeof types.ScanSessionsDocument,
};
const documents: Documents = {
    "\n  query CardNameSuggestions($q: String!, $limit: Int!) {\n    cardNameSuggestions(q: $q, limit: $limit)\n  }\n": types.CardNameSuggestionsDocument,
    "\n  query Cards($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n      }\n    }\n  }\n": types.CardsDocument,
    "\n  query Card($id: ID!) {\n    card(id: $id) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      oracleText\n      colorIdentity\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        lang\n        rarity\n        finishes\n        imageUrl\n        artCropUrl\n        releasedAt\n        prices\n      }\n    }\n  }\n": types.CardDocument,
    "\n  query Collection($filters: CollectionItemFilters) {\n    locations {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n    collectionItemCount(filters: $filters)\n  }\n": types.CollectionDocument,
    "\n  query Location($id: ID!) {\n    location(id: $id) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n": types.LocationDocument,
    "\n  query LocationCollectionCount($filters: CollectionItemFilters) {\n    collectionItemCount(filters: $filters)\n  }\n": types.LocationCollectionCountDocument,
    "\n  query LocationCoverCardSearch($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        artCropUrl\n        rarity\n      }\n    }\n  }\n": types.LocationCoverCardSearchDocument,
    "\n  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {\n    updateLocation(id: $id, input: $input) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n": types.UpdateLocationDocument,
    "\n  query CollectionItemsPage($filters: CollectionItemFilters, $sort: CollectionItemSort, $limit: Int!, $offset: Int!) {\n    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {\n      id\n      quantity\n      condition\n      language\n      finish\n      priceText\n      allocatedQuantity\n      location { id name }\n      printing {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n        card { oracleId name typeLine }\n      }\n    }\n  }\n": types.CollectionItemsPageDocument,
    "\n  query Decks {\n    decks {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": types.DecksDocument,
    "\n  mutation CreateDeck($input: DeckInput!) {\n    createDeck(input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": types.CreateDeckDocument,
    "\n  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {\n    updateDeck(id: $id, input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n": types.UpdateDeckDocument,
    "\n  query Deck($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        id\n        quantity\n        zone\n        finish\n        card {\n          oracleId\n          name\n          typeLine\n          cmc\n          colors\n          colorIdentity\n          printings { imageUrl artCropUrl setCode setName collectorNumber rarity }\n        }\n        preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n      }\n    }\n  }\n": types.DeckDocument,
    "\n  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {\n    updateDeckCard(id: $id, input: $input) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n": types.UpdateDeckCardDocument,
    "\n  mutation SetDeckCommander($id: ID!) {\n    setDeckCommander(id: $id) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n": types.SetDeckCommanderDocument,
    "\n  query Home {\n    homeSummary {\n      collectionCount\n      locationCount\n      deckCount\n      scanSessionCount\n    }\n  }\n": types.HomeDocument,
    "\n  query ScanSessions {\n    scanSessions {\n      id\n      name\n      defaultCondition\n      defaultLanguage\n      defaultFinish\n      itemCount\n      reviewCount\n      createdAt\n    }\n  }\n": types.ScanSessionsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CardNameSuggestions($q: String!, $limit: Int!) {\n    cardNameSuggestions(q: $q, limit: $limit)\n  }\n"): (typeof documents)["\n  query CardNameSuggestions($q: String!, $limit: Int!) {\n    cardNameSuggestions(q: $q, limit: $limit)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Cards($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n      }\n    }\n  }\n"): (typeof documents)["\n  query Cards($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Card($id: ID!) {\n    card(id: $id) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      oracleText\n      colorIdentity\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        lang\n        rarity\n        finishes\n        imageUrl\n        artCropUrl\n        releasedAt\n        prices\n      }\n    }\n  }\n"): (typeof documents)["\n  query Card($id: ID!) {\n    card(id: $id) {\n      oracleId\n      name\n      typeLine\n      manaCost\n      oracleText\n      colorIdentity\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        lang\n        rarity\n        finishes\n        imageUrl\n        artCropUrl\n        releasedAt\n        prices\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Collection($filters: CollectionItemFilters) {\n    locations {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n    collectionItemCount(filters: $filters)\n  }\n"): (typeof documents)["\n  query Collection($filters: CollectionItemFilters) {\n    locations {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n    collectionItemCount(filters: $filters)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Location($id: ID!) {\n    location(id: $id) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n"): (typeof documents)["\n  query Location($id: ID!) {\n    location(id: $id) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LocationCollectionCount($filters: CollectionItemFilters) {\n    collectionItemCount(filters: $filters)\n  }\n"): (typeof documents)["\n  query LocationCollectionCount($filters: CollectionItemFilters) {\n    collectionItemCount(filters: $filters)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LocationCoverCardSearch($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        artCropUrl\n        rarity\n      }\n    }\n  }\n"): (typeof documents)["\n  query LocationCoverCardSearch($q: String!, $limit: Int!) {\n    cards(q: $q, limit: $limit) {\n      oracleId\n      name\n      typeLine\n      printings {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        artCropUrl\n        rarity\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {\n    updateLocation(id: $id, input: $input) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {\n    updateLocation(id: $id, input: $input) {\n      id\n      name\n      kind\n      description\n      itemCount\n      totalPriceText\n      coverPrinting { scryfallId artCropUrl }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CollectionItemsPage($filters: CollectionItemFilters, $sort: CollectionItemSort, $limit: Int!, $offset: Int!) {\n    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {\n      id\n      quantity\n      condition\n      language\n      finish\n      priceText\n      allocatedQuantity\n      location { id name }\n      printing {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n        card { oracleId name typeLine }\n      }\n    }\n  }\n"): (typeof documents)["\n  query CollectionItemsPage($filters: CollectionItemFilters, $sort: CollectionItemSort, $limit: Int!, $offset: Int!) {\n    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {\n      id\n      quantity\n      condition\n      language\n      finish\n      priceText\n      allocatedQuantity\n      location { id name }\n      printing {\n        scryfallId\n        setCode\n        setName\n        collectorNumber\n        imageUrl\n        rarity\n        card { oracleId name typeLine }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Decks {\n    decks {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Decks {\n    decks {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateDeck($input: DeckInput!) {\n    createDeck(input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreateDeck($input: DeckInput!) {\n    createDeck(input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {\n    updateDeck(id: $id, input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {\n    updateDeck(id: $id, input: $input) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        preferredPrinting { imageUrl artCropUrl }\n        card { printings { imageUrl artCropUrl } }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Deck($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        id\n        quantity\n        zone\n        finish\n        card {\n          oracleId\n          name\n          typeLine\n          cmc\n          colors\n          colorIdentity\n          printings { imageUrl artCropUrl setCode setName collectorNumber rarity }\n        }\n        preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Deck($id: ID!) {\n    deck(id: $id) {\n      id\n      name\n      format\n      status\n      cardCount\n      uniqueCardCount\n      deckCards {\n        id\n        quantity\n        zone\n        finish\n        card {\n          oracleId\n          name\n          typeLine\n          cmc\n          colors\n          colorIdentity\n          printings { imageUrl artCropUrl setCode setName collectorNumber rarity }\n        }\n        preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {\n    updateDeckCard(id: $id, input: $input) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {\n    updateDeckCard(id: $id, input: $input) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetDeckCommander($id: ID!) {\n    setDeckCommander(id: $id) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n"): (typeof documents)["\n  mutation SetDeckCommander($id: ID!) {\n    setDeckCommander(id: $id) {\n      id\n      quantity\n      zone\n      finish\n      card { oracleId name typeLine }\n      preferredPrinting { imageUrl artCropUrl setCode setName collectorNumber rarity }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Home {\n    homeSummary {\n      collectionCount\n      locationCount\n      deckCount\n      scanSessionCount\n    }\n  }\n"): (typeof documents)["\n  query Home {\n    homeSummary {\n      collectionCount\n      locationCount\n      deckCount\n      scanSessionCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ScanSessions {\n    scanSessions {\n      id\n      name\n      defaultCondition\n      defaultLanguage\n      defaultFinish\n      itemCount\n      reviewCount\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  query ScanSessions {\n    scanSessions {\n      id\n      name\n      defaultCondition\n      defaultLanguage\n      defaultFinish\n      itemCount\n      reviewCount\n      createdAt\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;