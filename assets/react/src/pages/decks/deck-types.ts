import { Scissors, ShoppingCart, type LucideIcon } from "lucide-react"
import type {
  CardPrintingsQuery,
  DeckBuylistQuery,
  DeckEdhrecQuery,
  DeckQuery,
  DecksQuery,
  PreviewDeckDisassemblyMutation,
} from "../../gql/graphql"
type Maybe<T> = T | null | undefined
type RelayEdge<T> = { node?: Maybe<T> } | null
type RelayConnection<T> = { edges?: Maybe<ReadonlyArray<RelayEdge<T>>> }

type DeckConnectionDetail = NonNullable<DeckQuery["deck"]>
type DeckCardEdges = NonNullable<NonNullable<DeckConnectionDetail["deckCards"]>["edges"]>
type DeckCardConnectionEntry = NonNullable<NonNullable<DeckCardEdges[number]>["node"]>
type DeckCardConnectionCard = NonNullable<DeckCardConnectionEntry["card"]>

type DecksConnection = NonNullable<DecksQuery["decks"]>
type DecksEdges = NonNullable<DecksConnection["edges"]>
export type DeckSummary = NonNullable<NonNullable<DecksEdges[number]>["node"]>
type CardPrintingsDetail = NonNullable<CardPrintingsQuery["card"]>
type CardPrintingsEdges = NonNullable<NonNullable<CardPrintingsDetail["printings"]>["edges"]>
export type DeckCardPrinting = NonNullable<NonNullable<CardPrintingsEdges[number]>["node"]>
export type DeckCardEntry = Omit<DeckCardConnectionEntry, "card"> & {
  card: DeckCardConnectionCard | null
}

export type DeckDetail = Omit<DeckConnectionDetail, "deckCards"> & {
  deckCards: DeckCardEntry[]
}
export type BuylistPrintingMode = "none" | "exact" | "cheapest"
export type BuylistExportFormat = "text" | "csv"
export type BuylistEntry = DeckBuylistQuery["deckBuylist"][number]
export type EDHRecData = NonNullable<DeckEdhrecQuery["deckEdhrec"]>
type PreviewDeckDisassemblyPayload = NonNullable<
  PreviewDeckDisassemblyMutation["previewDeckDisassembly"]
>
export type DeckDisassemblyResult = NonNullable<PreviewDeckDisassemblyPayload["disassemblyResult"]>
export type EDHRecCard = EDHRecData["recommendations"][number]
export type EDHRecCommanderPage = EDHRecData["commanderPages"][number]
export type EDHRecSection = EDHRecCommanderPage["sections"][number]
export type EDHRecSectionCard = EDHRecSection["cards"][number]
export type EDHRecCollectionStatus =
  | EDHRecCard["collectionStatus"]
  | EDHRecSectionCard["collectionStatus"]
  | DeckCardEntry["allocationStatus"]
export type EDHRecTab = "recs" | "cuts" | "commander"
export function connectionNodes<T>(
  connection: Maybe<ReadonlyArray<Maybe<T>> | RelayConnection<T>>,
): T[] {
  if (!connection) return []
  if (isReadonlyArray(connection)) return connection.filter(isPresent)

  return (connection.edges || []).map((edge) => edge?.node).filter(isPresent)
}

export function flattenDecks(decks: Maybe<DecksQuery["decks"]>): DeckSummary[] {
  return connectionNodes(decks)
}

export function partitionDecksByArchive(decks: DeckSummary[]) {
  const activeDecks: DeckSummary[] = []
  const archivedDecks: DeckSummary[] = []

  for (const deck of decks) {
    if (deck.status === "archived") archivedDecks.push(deck)
    else activeDecks.push(deck)
  }

  return { activeDecks, archivedDecks }
}

export function flattenDeck(deck: Maybe<DeckConnectionDetail>): DeckDetail | null {
  if (!deck) return null

  return {
    ...deck,
    deckCards: flattenDeckCards(deck.deckCards),
  }
}

export function flattenDeckCards(
  deckCards: Maybe<DeckConnectionDetail["deckCards"]>,
): DeckCardEntry[]
export function flattenDeckCards(deckCards: Maybe<DeckDetail["deckCards"]>): DeckCardEntry[]
export function flattenDeckCards(
  deckCards: Maybe<DeckConnectionDetail["deckCards"] | DeckDetail["deckCards"]>,
): DeckCardEntry[] {
  if (!deckCards) return []
  if (isDeckCardEntryArray(deckCards)) return deckCards.map(flattenDeckCard)

  return connectionNodes(deckCards).map(flattenDeckCard)
}

export function flattenDeckCard(deckCard: DeckCardConnectionEntry | DeckCardEntry): DeckCardEntry {
  const card = deckCard.card

  if (!card) {
    return {
      ...deckCard,
      card: null,
    }
  }

  return {
    ...deckCard,
    card,
  }
}

function isDeckCardEntryArray(
  deckCards: NonNullable<DeckConnectionDetail["deckCards"] | DeckDetail["deckCards"]>,
): deckCards is DeckDetail["deckCards"] {
  return Array.isArray(deckCards)
}

function isReadonlyArray<T>(
  value: ReadonlyArray<Maybe<T>> | RelayConnection<T>,
): value is ReadonlyArray<Maybe<T>> {
  return Array.isArray(value)
}

function isPresent<T>(value: Maybe<T>): value is T {
  return value != null
}
export type DeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"
export type EDHRecAddZone = Extract<DeckZone, "mainboard" | "maybeboard" | "sideboard">
export type EDHRecCardReturnSearch = {
  deckId: string
  edhrec: EDHRecTab
  edhrecExcludeLands?: boolean
}
export type DeckCardTag = "getting" | "consider_cutting"
export type DeckLegality =
  | {
      status?: string | null
      issues?: Array<{
        code?: string | null
        message?: string | null
        severity?: string | null
        cardName?: string | null
      } | null> | null
    }
  | null
  | undefined
export const DECK_CARD_TAGS = [
  {
    value: "getting",
    label: "Getting",
    shortLabel: "Get",
    className: "bg-success text-success-content",
    iconClassName: "text-success",
    icon: ShoppingCart,
  },
  {
    value: "consider_cutting",
    label: "Consider Cutting",
    shortLabel: "Cut",
    className: "bg-warning text-warning-content",
    iconClassName: "text-warning",
    icon: Scissors,
  },
] satisfies Array<{
  value: DeckCardTag
  label: string
  shortLabel: string
  className: string
  iconClassName: string
  icon: LucideIcon
}>
export const DECK_FORMATS = [
  "commander",
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "pauper",
  "limited",
  "casual",
] as const
export const DECK_STATUSES = ["brewing", "active", "archived"] as const
export const MOVE_TARGET_ZONES: DeckZone[] = ["mainboard", "sideboard", "maybeboard"]
export const ADD_CARD_ZONES: DeckZone[] = ["mainboard", "sideboard", "commander", "maybeboard"]
export const NON_COMMANDER_ADD_CARD_ZONES: DeckZone[] = ["mainboard", "sideboard", "maybeboard"]
export const EDHREC_ADD_CARD_ZONES = [
  { label: "Main", zone: "mainboard" },
  { label: "Maybe", zone: "maybeboard" },
  { label: "Sideboard", zone: "sideboard" },
] satisfies Array<{ label: string; zone: EDHRecAddZone }>
export const EDHREC_SCROLL_STORAGE_PREFIX = "manavault.edhrec.scroll."
export const DECK_CARD_FINISHES = ["nonfoil", "foil", "etched"]
export const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C"]
export const DECK_STACK_CARD_WIDTH_REM = 14
export const DECK_STACK_OFFSET = 34
export const DECK_STACK_CARD_HEIGHT = 314
export const DECK_STACK_REVEAL_OFFSET = DECK_STACK_CARD_HEIGHT - DECK_STACK_OFFSET
export const DECK_CARD_HOVER_DELAY_MS = 100
