import { Scissors, ShoppingCart, type LucideIcon } from "lucide-react"
import type {
  DeckBuylistQuery,
  DeckEdhrecQuery,
  DeckQuery,
  DecksQuery,
  PreviewBulkAllocateDeckMutation,
} from "../../gql/graphql"

export type DeckSummary = DecksQuery["decks"][number]
export type DeckDetail = NonNullable<DeckQuery["deck"]>
export type DeckCardEntry = NonNullable<NonNullable<DeckDetail["deckCards"]>[number]>
export type BulkAllocationMode = "exact_printings" | "matching_printings"
export type BulkAllocationPreview = NonNullable<
  PreviewBulkAllocateDeckMutation["previewBulkAllocateDeck"]
>
export type BuylistPrintingMode = "none" | "exact" | "cheapest"
export type BuylistExportFormat = "text" | "csv"
export type BuylistEntry = DeckBuylistQuery["deckBuylist"][number]
export type EDHRecData = NonNullable<DeckEdhrecQuery["deckEdhrec"]>
export type EDHRecCard = EDHRecData["recommendations"][number]
export type EDHRecCommanderPage = EDHRecData["commanderPages"][number]
export type EDHRecSection = EDHRecCommanderPage["sections"][number]
export type EDHRecSectionCard = EDHRecSection["cards"][number]
export type EDHRecCollectionStatus =
  | EDHRecCard["collectionStatus"]
  | EDHRecSectionCard["collectionStatus"]
export type EDHRecTab = "recs" | "cuts" | "commander"
export type DeckCardPrinting = NonNullable<
  NonNullable<NonNullable<DeckCardEntry["card"]>["printings"]>[number]
>
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
    icon: ShoppingCart,
  },
  {
    value: "consider_cutting",
    label: "Consider Cutting",
    shortLabel: "Cut",
    className: "bg-warning text-warning-content",
    icon: Scissors,
  },
] satisfies Array<{
  value: DeckCardTag
  label: string
  shortLabel: string
  className: string
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
