import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clipboard,
  Crown,
  Database,
  Download,
  Droplets,
  Edit3,
  Eye,
  Gem,
  Hash,
  Layers,
  MoreVertical,
  MoveRight,
  Palette,
  PawPrint,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trash2,
  Upload,
  WandSparkles,
  XCircle,
  Zap,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type PointerEvent,
} from "react"
import { createPortal } from "react-dom"
import { PageHeader, PageSection } from "../components/app-shell"
import { CardNameSearchField } from "../components/card-name-search-field"
import { EmptyState } from "../components/card-image"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import type {
  DeckBuylistQuery,
  DeckCardUpdateInput,
  DeckQuery,
  DecksQuery,
  PreviewBulkAllocateDeckMutation,
} from "../gql/graphql"
import { request } from "../lib/graphql"
import { cn, compactNumber, present, titleize } from "../lib/utils"

const DecksDocument = graphql(`
  query Decks {
    decks {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting {
          imageUrl
          artCropUrl
        }
        card {
          printings {
            imageUrl
            artCropUrl
          }
        }
      }
    }
  }
`)

const CreateDeckDocument = graphql(`
  mutation CreateDeck($input: DeckInput!) {
    createDeck(input: $input) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting {
          imageUrl
          artCropUrl
        }
        card {
          printings {
            imageUrl
            artCropUrl
          }
        }
      }
    }
  }
`)

const UpdateDeckDocument = graphql(`
  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
    updateDeck(id: $id, input: $input) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting {
          imageUrl
          artCropUrl
        }
        card {
          printings {
            imageUrl
            artCropUrl
          }
        }
      }
    }
  }
`)

const DeckDocument = graphql(`
  query Deck($id: ID!) {
    deck(id: $id) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        id
        quantity
        zone
        finish
        card {
          oracleId
          name
          typeLine
          cmc
          colors
          colorIdentity
          printings {
            scryfallId
            imageUrl
            artCropUrl
            setCode
            setName
            collectorNumber
            rarity
            finishes
          }
        }
        preferredPrinting {
          scryfallId
          imageUrl
          artCropUrl
          setCode
          setName
          collectorNumber
          rarity
          finishes
        }
        allocationStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          candidates {
            allocated
            allocatedElsewhere
            available
            item {
              id
              quantity
              finish
              condition
              language
              priceText
              location {
                id
                name
              }
              printing {
                scryfallId
                setCode
                setName
                collectorNumber
                rarity
                card {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`)

const UpdateDeckCardDocument = graphql(`
  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
    updateDeckCard(id: $id, input: $input) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
        scryfallId
        imageUrl
        artCropUrl
        setCode
        setName
        collectorNumber
        rarity
        finishes
      }
    }
  }
`)

const AddDeckCardDocument = graphql(`
  mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
        imageUrl
        artCropUrl
        setCode
        setName
        collectorNumber
        rarity
      }
    }
  }
`)

const DeleteDeckCardDocument = graphql(`
  mutation DeleteDeckCard($id: ID!) {
    deleteDeckCard(id: $id) {
      id
    }
  }
`)

const SetDeckCommanderDocument = graphql(`
  mutation SetDeckCommander($id: ID!) {
    setDeckCommander(id: $id) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
        imageUrl
        artCropUrl
        setCode
        setName
        collectorNumber
        rarity
      }
    }
  }
`)

const AllocateDeckCardItemDocument = graphql(`
  mutation AllocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      id
      allocationStatus {
        state
        required
        owned
        allocated
        available
        allocatedElsewhere
        missing
      }
    }
  }
`)

const DeallocateDeckCardItemDocument = graphql(`
  mutation DeallocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      id
      allocationStatus {
        state
        required
        owned
        allocated
        available
        allocatedElsewhere
        missing
      }
    }
  }
`)

const PreviewBulkAllocateDeckDocument = graphql(`
  mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
    previewBulkAllocateDeck(id: $id, mode: $mode) {
      mode
      allocated
      cards
      skipped
      entries {
        quantity
        exact
        deckCard {
          id
          quantity
          finish
          card {
            name
          }
          preferredPrinting {
            setCode
            setName
            collectorNumber
          }
        }
        item {
          id
          quantity
          finish
          printing {
            setCode
            setName
            collectorNumber
            card {
              name
            }
          }
        }
      }
    }
  }
`)

const BulkAllocateDeckDocument = graphql(`
  mutation BulkAllocateDeck($id: ID!, $mode: String!) {
    bulkAllocateDeck(id: $id, mode: $mode) {
      allocated
      cards
      skipped
    }
  }
`)

const ImportDecklistDocument = graphql(`
  mutation ImportDecklist($id: ID!, $text: String!) {
    importDecklist(id: $id, text: $text) {
      imported
      unresolved
      skippedPrintings
    }
  }
`)

const DeckExportTextDocument = graphql(`
  query DeckExportText($id: ID!) {
    deckExportText(id: $id)
  }
`)

const DeckBuylistDocument = graphql(`
  query DeckBuylist(
    $id: ID!
    $printingMode: String!
    $exportFormat: String!
    $includeBasicLands: Boolean!
  ) {
    deckBuylist(id: $id, printingMode: $printingMode, includeBasicLands: $includeBasicLands) {
      cardName
      quantity
      missing
      unavailable
      reason
      finish
      setCode
      collectorNumber
      language
      unitPriceText
      totalPriceText
    }
    deckBuylistExport(
      id: $id
      format: $exportFormat
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
    )
  }
`)

export function DecksPage() {
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
  const [editingDeck, setEditingDeck] = useState<DeckSummary | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["decks"],
    queryFn: () => request(DecksDocument),
  })
  const deckGroups = groupDecksByFormat(data?.decks || [])

  return (
    <>
      <PageHeader
        title="Decks"
        eyebrow="ManaVault Decks"
        description="Build lists by card identity, then choose exact printings when that matters."
        actions={
          <Button type="button" onClick={() => setIsNewDeckOpen(true)}>
            <Plus className="h-4 w-4" />
            New deck
          </Button>
        }
      />
      {isLoading ? (
        <EmptyState title="Loading decks..." />
      ) : deckGroups.length ? (
        <PageSection count={`${data?.decks?.length || 0} total`}>
          <div className="space-y-10">
            {deckGroups.map(([format, decks]) => (
              <section key={format} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black tracking-normal">{titleize(format)}</h3>
                  <span className="badge border-transparent bg-base-200 text-sm">
                    {decks.length}
                  </span>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {decks.map((deck) => (
                    <div key={deck.id} className="relative">
                      <Link to="/decks/$id" params={{ id: deck.id }} className="block">
                        <ImageSummaryCard
                          imageUrl={deckCoverUrl(deck)}
                          fallback={<Layers className="h-12 w-12" />}
                          typeLine={<Badge>{titleize(deck.format)}</Badge>}
                          countLine={`${compactNumber(deck.cardCount || 0)} cards`}
                          detailLine={
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={deck.status === "active" ? "success" : "neutral"}>
                                {titleize(deck.status)}
                              </Badge>
                              <span>{compactNumber(deck.uniqueCardCount || 0)} unique</span>
                            </div>
                          }
                          nameLine={deck.name}
                        />
                      </Link>
                      <SummaryActionMenu
                        label={`${deck.name} actions`}
                        onEdit={() => setEditingDeck(deck)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </PageSection>
      ) : (
        <EmptyState title="No decks yet" />
      )}
      <NewDeckDialog open={isNewDeckOpen} onOpenChange={setIsNewDeckOpen} />
      <EditDeckDialog deck={editingDeck} onOpenChange={(open) => !open && setEditingDeck(null)} />
    </>
  )
}

export function DeckDetailPage({ id }: { id: string }) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("type")
  const [editTarget, setEditTarget] = useState<DeckCardEntry | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<DeckCardEntry | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [isEditDeckOpen, setIsEditDeckOpen] = useState(false)
  const [isImportDeckOpen, setIsImportDeckOpen] = useState(false)
  const [isExportDeckOpen, setIsExportDeckOpen] = useState(false)
  const [isMissingCardsOpen, setIsMissingCardsOpen] = useState(false)
  const [bulkAllocationPreview, setBulkAllocationPreview] = useState<BulkAllocationPreview | null>(
    null,
  )
  const [bulkAllocationError, setBulkAllocationError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["deck", id],
    queryFn: () => request(DeckDocument, { id }),
  })
  const deck = data?.deck
  const [isAddCardOpen, setIsAddCardOpen] = useState(false)
  const deckCards = useMemo(() => (deck?.deckCards || []).filter(present), [deck?.deckCards])
  const stackDeckCards = useMemo(
    () =>
      deckCards.filter(
        (deckCard) => deckCard.zone !== "sideboard" && deckCard.zone !== "maybeboard",
      ),
    [deckCards],
  )
  const sideboardCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "sideboard").sort(compareDeckCards),
    [deckCards],
  )
  const maybeboardCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "maybeboard").sort(compareDeckCards),
    [deckCards],
  )
  const groupedCards = useMemo(
    () => groupDeckCards(stackDeckCards, groupBy),
    [stackDeckCards, groupBy],
  )
  const zoneCounts = useMemo(() => countDeckZones(deckCards), [deckCards])
  const hasBulkAllocationAvailable = useMemo(
    () =>
      deckCards.some(
        (deckCard) =>
          deckCard.allocationStatus.available > 0 &&
          deckCard.allocationStatus.allocated < deckCard.allocationStatus.required,
      ),
    [deckCards],
  )

  const updateDeckCard = useMutation({
    mutationFn: ({
      deckCardId,
      input,
    }: {
      deckCardId: string
      input: DeckCardUpdateInput
    }) => request(UpdateDeckCardDocument, { id: deckCardId, input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      setEditTarget(null)
      setEditError(null)
      setMoveTarget(null)
      setMoveError(null)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not update deck card"
      if (editTarget) setEditError(message)
      else setMoveError(message)
    },
  })

  const deleteDeckCard = useMutation({
    mutationFn: (deckCardId: string) => request(DeleteDeckCardDocument, { id: deckCardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
    },
  })

  const setDeckCommander = useMutation({
    mutationFn: (deckCardId: string) => request(SetDeckCommanderDocument, { id: deckCardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setMoveError(null)
    },
    onError: (error) =>
      setMoveError(error instanceof Error ? error.message : "Could not set commander"),
  })
  const allocateDeckCardItem = useMutation({
    mutationFn: ({
      collectionItemId,
      deckCardId,
    }: {
      collectionItemId: string
      deckCardId: string
    }) => request(AllocateDeckCardItemDocument, { deckCardId, collectionItemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
    },
  })
  const deallocateDeckCardItem = useMutation({
    mutationFn: ({
      collectionItemId,
      deckCardId,
    }: {
      collectionItemId: string
      deckCardId: string
    }) => request(DeallocateDeckCardItemDocument, { deckCardId, collectionItemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
    },
  })
  const previewBulkAllocateDeck = useMutation({
    mutationFn: (mode: BulkAllocationMode) =>
      request(PreviewBulkAllocateDeckDocument, { id, mode }),
    onSuccess: (data) => {
      setBulkAllocationPreview(data.previewBulkAllocateDeck || null)
      setBulkAllocationError(null)
    },
    onError: (error) =>
      setBulkAllocationError(
        error instanceof Error ? error.message : "Could not preview allocation",
      ),
  })
  const bulkAllocateDeck = useMutation({
    mutationFn: (mode: BulkAllocationMode) => request(BulkAllocateDeckDocument, { id, mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      setBulkAllocationPreview(null)
      setBulkAllocationError(null)
    },
    onError: (error) =>
      setBulkAllocationError(error instanceof Error ? error.message : "Could not allocate deck"),
  })
  const allocationError =
    allocateDeckCardItem.error instanceof Error
      ? allocateDeckCardItem.error.message
      : deallocateDeckCardItem.error instanceof Error
        ? deallocateDeckCardItem.error.message
        : deleteDeckCard.error instanceof Error
          ? deleteDeckCard.error.message
          : null
  const isUpdatingDeckCard =
    updateDeckCard.isPending ||
    deleteDeckCard.isPending ||
    setDeckCommander.isPending ||
    allocateDeckCardItem.isPending ||
    deallocateDeckCardItem.isPending

  if (isLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

  function moveDeckCard(deckCard: DeckCardEntry, zone: DeckZone) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input: { zone } })
  }

  function editDeckCard(deckCard: DeckCardEntry, input: DeckCardUpdateInput) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input })
  }

  function confirmDeleteDeckCard(deckCard: DeckCardEntry) {
    const name = deckCard.card?.name || "this card"
    if (!window.confirm(`Delete ${name} from this deck?`)) return
    deleteDeckCard.mutate(deckCard.id)
  }

  return (
    <>
      <div className="space-y-7">
        <Button asChild variant="outline" size="sm">
          <Link to="/decks">Back to decks</Link>
        </Button>

        <ImageSummaryCard
          imageUrl={deckDetailCoverUrl(deckCards)}
          fallback={<Layers className="h-12 w-12" />}
          interactive={false}
          typeLine={<Badge>{titleize(deck.format)}</Badge>}
          countLine={`${compactNumber(deck.cardCount || 0)} cards`}
          detailLine={
            <div className="flex flex-wrap items-center gap-2 text-base">
              <Badge tone={deck.status === "active" ? "success" : "neutral"}>
                {titleize(deck.status)}
              </Badge>
              <span>{compactNumber(deck.uniqueCardCount || 0)} unique</span>
            </div>
          }
          nameLine={deck.name}
          actionSlot={
            <SummaryActionMenu
              label={`${deck.name} actions`}
              onEdit={() => setIsEditDeckOpen(true)}
              onExport={() => setIsExportDeckOpen(true)}
              onImport={() => setIsImportDeckOpen(true)}
              onMissing={() => setIsMissingCardsOpen(true)}
            />
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
          <div className="flex flex-wrap gap-2">
            {(["commander", "mainboard", "sideboard", "maybeboard"] as DeckZone[]).map((zone) => (
              <Badge
                key={zone}
                tone={zone === "commander" ? "primary" : "neutral"}
                className="h-7 px-3 text-xs"
              >
                {titleize(zone)} {zoneCounts[zone] || 0}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setIsAddCardOpen(true)}>
              <Plus className="h-4 w-4" />
              Add card
            </Button>
            {hasBulkAllocationAvailable ? (
              <BulkAllocationMenu
                disabled={previewBulkAllocateDeck.isPending || bulkAllocateDeck.isPending}
                onPreview={(mode) => {
                  setBulkAllocationError(null)
                  previewBulkAllocateDeck.mutate(mode)
                }}
              />
            ) : null}
            <DeckGroupMenu value={groupBy} onChange={setGroupBy} />
          </div>
        </div>

        {groupedCards.length ? (
          <DeckGroupGrid
            canSetCommander={deck.format === "commander"}
            groups={groupedCards}
            isUpdating={isUpdatingDeckCard}
            onMove={(deckCard) => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onEdit={(deckCard) => {
              setEditError(null)
              setEditTarget(deckCard)
            }}
            onAllocate={(deckCard, collectionItemId) =>
              allocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId })
            }
            onDeallocate={(deckCard, collectionItemId) =>
              deallocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId })
            }
            onDelete={confirmDeleteDeckCard}
            onSetCommander={(deckCard) => setDeckCommander.mutate(deckCard.id)}
            allocationError={allocationError}
          />
        ) : (
          <EmptyState title="No cards in this deck" />
        )}

        <div className="space-y-3">
          <DeckZoneTable
            cards={sideboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Sideboard"
            onMove={(deckCard) => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onEdit={(deckCard) => {
              setEditError(null)
              setEditTarget(deckCard)
            }}
            onDelete={confirmDeleteDeckCard}
          />
          <DeckZoneTable
            cards={maybeboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Maybeboard"
            onMove={(deckCard) => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onEdit={(deckCard) => {
              setEditError(null)
              setEditTarget(deckCard)
            }}
            onDelete={confirmDeleteDeckCard}
          />
        </div>
      </div>

      <EditDeckDialog deck={deck} onOpenChange={setIsEditDeckOpen} open={isEditDeckOpen} />
      <AddDeckCardDialog deck={deck} onOpenChange={setIsAddCardOpen} open={isAddCardOpen} />
      <ImportDecklistDialog
        deck={deck}
        onOpenChange={setIsImportDeckOpen}
        open={isImportDeckOpen}
      />
      <ExportDecklistDialog
        deck={deck}
        onOpenChange={setIsExportDeckOpen}
        open={isExportDeckOpen}
      />
      <MissingCardsDialog
        deck={deck}
        onOpenChange={setIsMissingCardsOpen}
        open={isMissingCardsOpen}
      />
      <BulkAllocationPreviewDialog
        error={bulkAllocationError}
        isPending={bulkAllocateDeck.isPending}
        onClose={() => {
          if (!bulkAllocateDeck.isPending) {
            setBulkAllocationPreview(null)
            setBulkAllocationError(null)
          }
        }}
        onConfirm={(mode) => bulkAllocateDeck.mutate(mode)}
        preview={bulkAllocationPreview}
      />

      <MoveDeckCardDialog
        deckCard={moveTarget}
        error={moveError}
        isPending={isUpdatingDeckCard}
        onClose={() => {
          if (!updateDeckCard.isPending) {
            setMoveError(null)
            setMoveTarget(null)
          }
        }}
        onMove={(zone) => {
          if (moveTarget) moveDeckCard(moveTarget, zone)
        }}
        zoneCounts={zoneCounts}
      />
      <EditDeckCardDialog
        deckCard={editTarget}
        deckFormat={deck.format}
        error={editError}
        isPending={updateDeckCard.isPending}
        onClose={() => {
          if (!updateDeckCard.isPending) {
            setEditError(null)
            setEditTarget(null)
          }
        }}
        onSave={(input) => {
          if (editTarget) editDeckCard(editTarget, input)
        }}
      />
    </>
  )
}

type DeckSummary = DecksQuery["decks"][number]
type DeckDetail = NonNullable<DeckQuery["deck"]>
type DeckCardEntry = NonNullable<NonNullable<DeckDetail["deckCards"]>[number]>
type DeckCardPrinting = NonNullable<NonNullable<NonNullable<DeckCardEntry["card"]>["printings"]>[number]>
type DeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"
type DeckGroupBy = "type" | "color" | "colorIdentity" | "manaValue" | "rarity" | "set" | "none"
type BulkAllocationMode = "exact_printings" | "matching_printings"
type BulkAllocationPreview = NonNullable<PreviewBulkAllocateDeckMutation["previewBulkAllocateDeck"]>
type BuylistPrintingMode = "none" | "exact" | "cheapest"
type BuylistExportFormat = "text" | "csv"
type BuylistEntry = DeckBuylistQuery["deckBuylist"][number]
type DeckGroup = {
  cards: DeckCardEntry[]
  icon: DeckGroupIcon
  key: string
  label: string
  order: number
  quantity: number
}
type DeckGroupIcon =
  | "commander"
  | "creature"
  | "instant"
  | "sorcery"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "land"
  | "color"
  | "mana"
  | "rarity"
  | "set"
  | "none"

const DECK_GROUP_OPTIONS: Array<{ label: string; value: DeckGroupBy }> = [
  { label: "Type", value: "type" },
  { label: "Color", value: "color" },
  { label: "Color Identity", value: "colorIdentity" },
  { label: "Mana Value", value: "manaValue" },
  { label: "Rarity", value: "rarity" },
  { label: "Set", value: "set" },
  { label: "None", value: "none" },
]
const DECK_FORMATS = [
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
const DECK_STATUSES = ["brewing", "active", "archived"] as const
const MOVE_TARGET_ZONES: DeckZone[] = ["mainboard", "sideboard", "maybeboard"]
const ADD_CARD_ZONES: DeckZone[] = ["mainboard", "sideboard", "commander", "maybeboard"]
const NON_COMMANDER_ADD_CARD_ZONES: DeckZone[] = ["mainboard", "sideboard", "maybeboard"]
const DECK_CARD_FINISHES = ["nonfoil", "foil", "etched"]
const TYPE_ORDER = [
  "commander",
  "creature",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "planeswalker",
  "battle",
  "land",
  "other",
]
const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C"]
const DECK_STACK_CARD_WIDTH_REM = 14
const DECK_STACK_OFFSET = 34
const DECK_STACK_CARD_HEIGHT = 314
const DECK_STACK_REVEAL_OFFSET = DECK_STACK_CARD_HEIGHT - DECK_STACK_OFFSET

function SummaryActionMenu({
  label,
  onEdit,
  onExport,
  onImport,
  onMissing,
}: {
  label: string
  onEdit: () => void
  onExport?: () => void
  onImport?: () => void
  onMissing?: () => void
}) {
  return (
    <div
      className="dropdown dropdown-end absolute right-3 top-3 z-20"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
        tabIndex={0}
        aria-label={label}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
      >
        <li>
          <button type="button" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </li>
        {onImport ? (
          <li>
            <button type="button" onClick={onImport}>
              <Upload className="h-4 w-4" />
              Import decklist
            </button>
          </li>
        ) : null}
        {onMissing ? (
          <li>
            <button type="button" onClick={onMissing}>
              <ShoppingCart className="h-4 w-4" />
              Missing cards
            </button>
          </li>
        ) : null}
        {onExport ? (
          <li>
            <button type="button" onClick={onExport}>
              <Download className="h-4 w-4" />
              Export decklist
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function groupDecksByFormat(decks: DeckSummary[]) {
  const grouped = new Map<string, DeckSummary[]>()
  for (const deck of decks) {
    const group = grouped.get(deck.format) || []
    group.push(deck)
    grouped.set(deck.format, group)
  }

  return [...grouped.entries()].sort(
    ([left], [right]) =>
      formatSortValue(left) - formatSortValue(right) || left.localeCompare(right),
  )
}

function formatSortValue(format: string) {
  const index = DECK_FORMATS.indexOf(format as (typeof DECK_FORMATS)[number])
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function deckCoverUrl(deck: DeckSummary) {
  const cover = deck.deckCards?.find(
    (card) =>
      card?.preferredPrinting?.artCropUrl ||
      card?.preferredPrinting?.imageUrl ||
      card?.card?.printings?.[0]?.artCropUrl ||
      card?.card?.printings?.[0]?.imageUrl,
  )
  return (
    cover?.preferredPrinting?.artCropUrl ||
    cover?.preferredPrinting?.imageUrl ||
    cover?.card?.printings?.[0]?.artCropUrl ||
    cover?.card?.printings?.[0]?.imageUrl
  )
}

function countDeckZones(deckCards: DeckCardEntry[]) {
  return deckCards.reduce<Record<DeckZone, number>>(
    (counts, deckCard) => {
      counts[deckCard.zone as DeckZone] =
        (counts[deckCard.zone as DeckZone] || 0) + deckCard.quantity
      return counts
    },
    { commander: 0, mainboard: 0, maybeboard: 0, sideboard: 0 },
  )
}

function groupDeckCards(deckCards: DeckCardEntry[], groupBy: DeckGroupBy) {
  const groups = new Map<string, DeckGroup>()

  for (const deckCard of deckCards) {
    const descriptor = deckCardGroupDescriptor(deckCard, groupBy)
    const existing =
      groups.get(descriptor.key) ||
      ({
        cards: [],
        icon: descriptor.icon,
        key: descriptor.key,
        label: descriptor.label,
        order: descriptor.order,
        quantity: 0,
      } satisfies DeckGroup)

    existing.cards.push(deckCard)
    existing.quantity += deckCard.quantity
    groups.set(descriptor.key, existing)
  }

  return [...groups.values()]
    .map((group) => ({ ...group, cards: group.cards.sort(compareDeckCards) }))
    .sort((left, right) => compareDeckGroups(left, right, groupBy))
}

function compareDeckGroups(left: DeckGroup, right: DeckGroup, groupBy: DeckGroupBy) {
  if (groupBy === "type") {
    if (left.key === "commander" && right.key !== "commander") return -1
    if (right.key === "commander" && left.key !== "commander") return 1

    return left.label.localeCompare(right.label)
  }

  return left.order - right.order || left.label.localeCompare(right.label)
}

function deckCardGroupDescriptor(
  deckCard: DeckCardEntry,
  groupBy: DeckGroupBy,
): Omit<DeckGroup, "cards" | "quantity"> {
  const card = deckCard.card
  const printing = deckCard.preferredPrinting || card?.printings?.[0]

  if (groupBy === "none") return { icon: "none", key: "all", label: "Deck", order: 0 }

  if (groupBy === "color") {
    const colors = (card?.colors || []).filter(present)
    const key = colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors[0] || "C"
    return { icon: "color", key, label: colorLabel(key), order: colorOrder(key) }
  }

  if (groupBy === "colorIdentity") {
    const identity = (card?.colorIdentity || [])
      .filter(present)
      .sort((left, right) => colorOrder(left) - colorOrder(right))
    const key = identity.length ? identity.join("") : "C"
    return {
      icon: "color",
      key,
      label: key === "C" ? "Colorless" : `${key} Identity`,
      order: identity.length ? identity.reduce((sum, color) => sum + colorOrder(color), 0) : 99,
    }
  }

  if (groupBy === "manaValue") {
    const cmc = Math.floor(card?.cmc || 0)
    const key = cmc >= 6 ? "6+" : String(cmc)
    return { icon: "mana", key, label: `Mana ${key}`, order: cmc >= 6 ? 6 : cmc }
  }

  if (groupBy === "rarity") {
    const rarity = printing?.rarity || "unknown"
    return { icon: "rarity", key: rarity, label: titleize(rarity), order: rarityOrder(rarity) }
  }

  if (groupBy === "set") {
    const key = printing?.setCode || "unknown"
    return { icon: "set", key, label: printing?.setName || key.toUpperCase(), order: 0 }
  }

  return typeDescriptor(deckCard)
}

function typeDescriptor(deckCard: DeckCardEntry): Omit<DeckGroup, "cards" | "quantity"> {
  const typeLine = deckCard.card?.typeLine || ""

  if (deckCard.zone === "commander") return typeGroup("commander", "Commander", "commander")
  if (/\bCreature\b/.test(typeLine)) return typeGroup("creature", "Creatures", "creature")
  if (/\bInstant\b/.test(typeLine)) return typeGroup("instant", "Instants", "instant")
  if (/\bSorcery\b/.test(typeLine)) return typeGroup("sorcery", "Sorceries", "sorcery")
  if (/\bArtifact\b/.test(typeLine)) return typeGroup("artifact", "Artifacts", "artifact")
  if (/\bEnchantment\b/.test(typeLine))
    return typeGroup("enchantment", "Enchantments", "enchantment")
  if (/\bPlaneswalker\b/.test(typeLine))
    return typeGroup("planeswalker", "Planeswalkers", "planeswalker")
  if (/\bLand\b/.test(typeLine)) return typeGroup("land", "Lands", "land")

  return typeGroup("other", "Other", "none")
}

function isLegendaryCreature(deckCard: DeckCardEntry) {
  const typeLine = deckCard.card?.typeLine || ""
  return typeLine.includes("Legendary") && typeLine.includes("Creature")
}

function typeGroup(key: string, label: string, icon: DeckGroupIcon) {
  return { icon, key, label, order: TYPE_ORDER.indexOf(key) === -1 ? 99 : TYPE_ORDER.indexOf(key) }
}

function compareDeckCards(left: DeckCardEntry, right: DeckCardEntry) {
  return (
    (left.card?.name || "").localeCompare(right.card?.name || "") || left.id.localeCompare(right.id)
  )
}

function cardImageUrl(deckCard: DeckCardEntry, key: "artCropUrl" | "imageUrl") {
  const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
  return printing?.[key] || null
}

function colorOrder(color: string) {
  const index = COLOR_ORDER.indexOf(color)
  return index === -1 ? 99 : index
}

function colorLabel(color: string) {
  const labels: Record<string, string> = {
    B: "Black",
    C: "Colorless",
    G: "Green",
    M: "Multicolor",
    R: "Red",
    U: "Blue",
    W: "White",
  }
  return labels[color] || color
}

function rarityOrder(rarity: string) {
  const order = ["common", "uncommon", "rare", "mythic", "special", "bonus"]
  const index = order.indexOf(String(rarity).toLowerCase())
  return index === -1 ? 99 : index
}

function GroupIcon({ icon }: { icon: DeckGroupIcon }) {
  const className = "h-4 w-4 shrink-0 text-warning"

  if (icon === "commander") return <Crown className={className} />
  if (icon === "creature") return <PawPrint className={className} />
  if (icon === "instant") return <Zap className={className} />
  if (icon === "sorcery") return <WandSparkles className={className} />
  if (icon === "artifact") return <Gem className={className} />
  if (icon === "enchantment") return <SparkleIcon className={className} />
  if (icon === "planeswalker") return <Palette className={className} />
  if (icon === "land") return <Droplets className={className} />
  if (icon === "color") return <Palette className={className} />
  if (icon === "mana") return <Hash className={className} />
  if (icon === "rarity") return <Star className={className} />
  if (icon === "set") return <Box className={className} />

  return <Layers className={className} />
}

function ZoneIcon({ zone }: { zone: DeckZone }) {
  const className = "h-6 w-6 shrink-0 text-base-content/80"

  if (zone === "mainboard") return <Layers className={className} />
  if (zone === "sideboard") return <Box className={className} />
  if (zone === "maybeboard") return <Circle className={className} />

  return <Crown className={className} />
}

function SparkleIcon({ className }: { className?: string }) {
  return <Star className={className} />
}

function deckDetailCoverUrl(deckCards: DeckCardEntry[]) {
  const cover = deckCards.find(
    (deckCard) => cardImageUrl(deckCard, "artCropUrl") || cardImageUrl(deckCard, "imageUrl"),
  )
  return cover ? cardImageUrl(cover, "artCropUrl") || cardImageUrl(cover, "imageUrl") : null
}

function DeckGroupMenu({
  onChange,
  value,
}: {
  onChange: (value: DeckGroupBy) => void
  value: DeckGroupBy
}) {
  const active =
    DECK_GROUP_OPTIONS.find((option) => option.value === value) || DECK_GROUP_OPTIONS[0]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-outline min-w-44 justify-between gap-2"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Group
        </span>
        <span className="badge badge-ghost text-[0.65rem]">{active.label}</span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="grid gap-1">
            {DECK_GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  "flex items-center gap-3 rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  value === option.value
                    ? "bg-primary/15 text-primary"
                    : "text-base-content/75 hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span
                  className={
                    value === option.value
                      ? "h-4 w-4 rounded-full border-4 border-primary"
                      : "h-4 w-4 rounded-full border-2 border-base-content/25"
                  }
                />
                <span className="font-semibold">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BulkAllocationMenu({
  disabled,
  onPreview,
}: {
  disabled: boolean
  onPreview: (mode: BulkAllocationMode) => void
}) {
  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-primary btn-sm min-w-40 justify-between gap-2 px-4"
        tabIndex={0}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Allocation
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
      <div
        tabIndex={0}
        className="dropdown-content z-50 mt-2 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-2xl"
      >
        <button
          type="button"
          className="btn btn-primary btn-sm w-full justify-start"
          onClick={() => onPreview("exact_printings")}
        >
          <CheckCircle2 className="h-4 w-4" />
          Exact printings
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm mt-2 w-full justify-start"
          onClick={() => onPreview("matching_printings")}
        >
          <Layers className="h-4 w-4" />
          Partial matches
        </button>
      </div>
    </div>
  )
}

function BulkAllocationPreviewDialog({
  error,
  isPending,
  onClose,
  onConfirm,
  preview,
}: {
  error: string | null
  isPending: boolean
  onClose: () => void
  onConfirm: (mode: BulkAllocationMode) => void
  preview: BulkAllocationPreview | null
}) {
  const mode = bulkAllocationMode(preview?.mode)

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-4xl" labelledBy="bulk-allocation-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-allocation-title">{bulkAllocationModeLabel(mode)}</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {preview
                ? `${preview.allocated} collection ${copyLabel(preview.allocated)} across ${preview.cards} ${deckCardLabel(preview.cards)}.`
                : null}
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          {preview?.entries.length === 0 ? (
            <div className="rounded-box border border-info/20 bg-info/10 p-4 text-sm">
              No available collection copies matched this allocation mode.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-box border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-16">Qty</th>
                    <th>Deck card</th>
                    <th>Collection printing</th>
                    <th className="w-24">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {preview?.entries.map((entry, index) => (
                    <tr key={`${entry.deckCard.id}-${entry.item.id}-${index}`}>
                      <td className="font-black">{entry.quantity}</td>
                      <td>
                        <div className="font-semibold">{entry.deckCard.card?.name}</div>
                        <div className="text-xs text-base-content/60">
                          Wants {deckCardPrintingLabel(entry.deckCard)} ·{" "}
                          {titleize(entry.deckCard.finish || "nonfoil")}
                        </div>
                      </td>
                      <td>
                        <div className="font-semibold">
                          {collectionItemPrintingLabel(entry.item)}
                        </div>
                        <div className="text-xs text-base-content/60">
                          Owned {entry.item.quantity} · {titleize(entry.item.finish)}
                        </div>
                      </td>
                      <td>
                        <Badge tone={entry.exact ? "success" : "warning"}>
                          {entry.exact ? "Exact" : "Partial"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !preview || preview.entries.length === 0}
              onClick={() => onConfirm(mode)}
            >
              {isPending ? "Allocating..." : "Allocate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function bulkAllocationMode(value?: string | null): BulkAllocationMode {
  return value === "exact_printings" ? "exact_printings" : "matching_printings"
}

function bulkAllocationModeLabel(mode: BulkAllocationMode) {
  return mode === "exact_printings" ? "Exact printings" : "Partial matches"
}

function copyLabel(count: number) {
  return count === 1 ? "copy" : "copies"
}

function deckCardLabel(count: number) {
  return count === 1 ? "deck card" : "deck cards"
}

function buylistSummary(entries: BuylistEntry[]) {
  if (!entries.length) return "No purchases needed."

  const quantity = entries.reduce((total, entry) => total + entry.quantity, 0)
  const missing = entries.reduce((total, entry) => total + entry.missing, 0)
  const unavailable = entries.reduce((total, entry) => total + entry.unavailable, 0)
  return `${quantity} cards to source: ${missing} missing, ${unavailable} owned but unavailable.`
}

function buylistReasonTone(entry: BuylistEntry) {
  if (entry.missing > 0 && entry.unavailable > 0) return "warning"
  if (entry.unavailable > 0) return "primary"
  return "error"
}

function buylistPrintingLabel(entry: BuylistEntry) {
  if (entry.setCode && entry.collectorNumber) {
    return `${entry.setCode.toUpperCase()} ${entry.collectorNumber}`
  }

  return "Any printing"
}

function vendorBuylistLine(entry: BuylistEntry) {
  return `${entry.quantity} ${entry.cardName}`
}

function vendorBuylistPlainText(entries: BuylistEntry[]) {
  return entries.map(vendorBuylistLine).join("\n")
}

function vendorBuylistPipeText(entries: BuylistEntry[]) {
  return entries.map(vendorBuylistLine).join("||")
}

function manaPoolBuylistUrl(entries: BuylistEntry[]) {
  if (!entries.length) return "https://manapool.com/add-deck"

  return `https://manapool.com/add-deck?deck=${encodeURIComponent(
    utf8Base64(vendorBuylistPlainText(entries)),
  )}`
}

function tcgplayerBuylistUrl(entries: BuylistEntry[]) {
  if (!entries.length) return "https://store.tcgplayer.com/massentry"
  return `https://store.tcgplayer.com/massentry?c=${encodeURIComponent(
    vendorBuylistPipeText(entries),
  )}`
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function deckCardPrintingLabel(deckCard: BulkAllocationPreview["entries"][number]["deckCard"]) {
  const printing = deckCard.preferredPrinting
  if (!printing) return "Any printing"

  return printingSetLabel(printing) || printing.setName || "Preferred printing"
}

function collectionItemPrintingLabel(item: BulkAllocationPreview["entries"][number]["item"]) {
  const printing = item.printing
  return (
    printingSetLabel(printing) || printing?.setName || printing?.card?.name || "Collection item"
  )
}

function printingSetLabel(
  printing?: { collectorNumber?: string | null; setCode?: string | null } | null,
) {
  return [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

function DeckGroupGrid({
  allocationError,
  canSetCommander,
  groups,
  isUpdating,
  onAllocate,
  onDeallocate,
  onDelete,
  onEdit,
  onMove,
  onSetCommander,
}: {
  allocationError: string | null
  canSetCommander: boolean
  groups: DeckGroup[]
  isUpdating: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
}) {
  return (
    <div
      className="mx-auto columns-1 gap-8 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5"
      style={{
        maxWidth: `calc(5 * ${DECK_STACK_CARD_WIDTH_REM}rem + 4 * 2rem)`,
      }}
    >
      {groups.map((group) => (
        <DeckStackGroup
          key={group.key}
          canSetCommander={canSetCommander}
          group={group}
          isUpdating={isUpdating}
          allocationError={allocationError}
          onAllocate={onAllocate}
          onDeallocate={onDeallocate}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
          onSetCommander={onSetCommander}
        />
      ))}
    </div>
  )
}

function deckStackIndexFromPointer(
  pointerY: number,
  activeIndex: number | null,
  cardCount: number,
) {
  if (cardCount <= 0) return null

  const lastIndex = cardCount - 1
  const stackHeight = DECK_STACK_CARD_HEIGHT + lastIndex * DECK_STACK_OFFSET
  const y = Math.max(0, Math.min(pointerY, stackHeight - 1))

  if (activeIndex != null) {
    const activeTop = activeIndex * DECK_STACK_OFFSET
    const activeBottom = activeTop + DECK_STACK_CARD_HEIGHT

    if (y >= activeTop && y < activeBottom) return activeIndex
    if (y >= activeBottom) {
      return Math.min(
        lastIndex,
        activeIndex + 1 + Math.floor((y - activeBottom) / DECK_STACK_OFFSET),
      )
    }
  }

  return Math.min(lastIndex, Math.floor(y / DECK_STACK_OFFSET))
}

function DeckStackGroup({
  allocationError,
  canSetCommander,
  group,
  isUpdating,
  onAllocate,
  onDeallocate,
  onDelete,
  onEdit,
  onMove,
  onSetCommander,
}: {
  allocationError: string | null
  canSetCommander: boolean
  group: DeckGroup
  isUpdating: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const activeIndex = hoveredIndex ?? pinnedIndex
  const revealOffset = group.cards.length > 1 ? DECK_STACK_REVEAL_OFFSET : 0

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return

    const bounds = event.currentTarget.getBoundingClientRect()
    const nextIndex = deckStackIndexFromPointer(
      event.clientY - bounds.top,
      activeIndex,
      group.cards.length,
    )
    if (nextIndex === hoveredIndex && pinnedIndex == null) return

    setPinnedIndex(null)
    setHoveredIndex(nextIndex)
  }

  return (
    <section className="mb-5 inline-block w-full break-inside-avoid space-y-3">
      <div className="flex items-center gap-2 text-sm font-black tracking-normal">
        <GroupIcon icon={group.icon} />
        <h3 className="truncate">{group.label}</h3>
        <span className="text-base-content/55">({group.quantity})</span>
      </div>

      <div
        className="relative w-56 overflow-visible"
        style={{
          minHeight: `${DECK_STACK_CARD_HEIGHT + Math.max(group.cards.length - 1, 0) * DECK_STACK_OFFSET}px`,
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") setHoveredIndex(null)
        }}
        onPointerMove={handlePointerMove}
      >
        {group.cards.map((deckCard, index) => (
          <DeckStackCard
            key={deckCard.id}
            canSetCommander={
              canSetCommander && deckCard.zone !== "commander" && isLegendaryCreature(deckCard)
            }
            deckCard={deckCard}
            index={index}
            isActive={activeIndex === index}
            isUpdating={isUpdating}
            allocationError={allocationError}
            onExpand={() => {
              setHoveredIndex(null)
              setPinnedIndex(index)
            }}
            onAllocate={(collectionItemId) => onAllocate(deckCard, collectionItemId)}
            onDeallocate={(collectionItemId) => onDeallocate(deckCard, collectionItemId)}
            onDelete={() => onDelete(deckCard)}
            onEdit={() => onEdit(deckCard)}
            onMove={() => onMove(deckCard)}
            onSetCommander={() => onSetCommander(deckCard)}
            slideOffset={activeIndex != null && index > activeIndex ? revealOffset : 0}
            top={index * DECK_STACK_OFFSET}
          />
        ))}
      </div>
    </section>
  )
}

function DeckStackCard({
  allocationError,
  canSetCommander,
  deckCard,
  index,
  isActive,
  isUpdating,
  onAllocate,
  onDeallocate,
  onDelete,
  onEdit,
  onExpand,
  onMove,
  onSetCommander,
  slideOffset,
  top,
}: {
  allocationError: string | null
  canSetCommander: boolean
  deckCard: DeckCardEntry
  index: number
  isActive: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onDelete: () => void
  onEdit: () => void
  onExpand: () => void
  onMove: () => void
  onSetCommander: () => void
  slideOffset: number
  top: number
}) {
  const [hasFocusWithin, setHasFocusWithin] = useState(false)
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const name = deckCard.card?.name || "Unknown card"
  const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
  const isInteractive = isActive || hasFocusWithin

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHasFocusWithin(false)
    }
  }

  return (
    <article
      className={cn(
        "group/deck-card absolute left-0 w-56 origin-top rounded-xl transition-transform duration-200 ease-out focus-within:z-[90]",
        isInteractive && "z-[90]",
      )}
      onBlur={handleBlur}
      onFocus={() => setHasFocusWithin(true)}
      style={{
        top,
        transform: slideOffset ? `translateY(${slideOffset}px)` : undefined,
        zIndex: isInteractive ? 90 : index + 1,
      }}
    >
      <DeckCardAllocationMenu
        deckCard={deckCard}
        error={allocationError}
        isInteractive={isInteractive}
        isUpdating={isUpdating}
        onAllocate={onAllocate}
        onDeallocate={onDeallocate}
      />

      <div
        className={cn(
          "dropdown dropdown-end absolute right-2 top-2 z-[120] transition-opacity group-focus-within/deck-card:opacity-100",
          isInteractive ? "opacity-100" : "opacity-0",
        )}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow transition hover:bg-neutral"
          tabIndex={isInteractive ? 0 : -1}
          aria-label={`${name} actions`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {isInteractive ? (
          <ul
            tabIndex={0}
            className="menu dropdown-content z-[120] mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
          >
            <li>
              <Link to="/cards/$id" params={{ id: deckCard.card?.oracleId || "" }}>
                <Eye className="h-4 w-4" />
                View card
              </Link>
            </li>
            <li>
              <button type="button" disabled={isUpdating} onClick={onEdit}>
                <Edit3 className="h-4 w-4" />
                Edit
              </button>
            </li>
            <li>
              <button type="button" disabled={isUpdating} onClick={onMove}>
                <MoveRight className="h-4 w-4" />
                Move
              </button>
            </li>
            {canSetCommander ? (
              <li>
                <button type="button" disabled={isUpdating} onClick={onSetCommander}>
                  <Crown className="h-4 w-4" />
                  Set as commander
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                className="text-error"
                disabled={isUpdating}
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      <button type="button" className="block w-full cursor-pointer text-left" onClick={onExpand}>
        <figure
          className={cn(
            "relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-xl ring-1 ring-white/10 transition duration-200",
            isActive && "shadow-2xl ring-primary/45",
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-5 text-center text-sm text-base-content/50">
              No image
            </div>
          )}

          {deckCard.quantity > 1 ? (
            <span className="absolute right-0 top-0 z-20 rounded-bl-xl bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg">
              {deckCard.quantity}
            </span>
          ) : null}

          <figcaption
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-12 text-white transition duration-200 group-focus-within/deck-card:opacity-100",
              isInteractive ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="line-clamp-2 text-sm font-black leading-tight">{name}</div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/75">
              <span className="truncate">
                {printing?.setName || printing?.setCode?.toUpperCase() || titleize(deckCard.zone)}
              </span>
              <span>#{printing?.collectorNumber || "?"}</span>
            </div>
          </figcaption>
        </figure>
      </button>
    </article>
  )
}

function DeckCardAllocationMenu({
  deckCard,
  error,
  isInteractive,
  isUpdating,
  onAllocate,
  onDeallocate,
}: {
  deckCard: DeckCardEntry
  error: string | null
  isInteractive: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
}) {
  const status = deckCard.allocationStatus
  const label = allocationStatusLabel(status)
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 16, top: 16 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function updateMenuPosition() {
    const button = buttonRef.current
    if (!button) return

    const bounds = button.getBoundingClientRect()
    const menuWidth = 320
    const menuMaxHeight = 416
    const margin = 16
    const spaceBelow = window.innerHeight - bounds.bottom - margin
    const spaceAbove = bounds.top - margin
    const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow

    setMenuPosition({
      left: Math.min(
        Math.max(bounds.left, margin),
        Math.max(window.innerWidth - menuWidth - margin, margin),
      ),
      top: openAbove
        ? Math.max(margin, bounds.top - Math.min(menuMaxHeight, spaceAbove) - 4)
        : Math.min(bounds.bottom + 4, Math.max(window.innerHeight - margin, margin)),
    })
  }

  useEffect(() => {
    if (!isInteractive) setOpen(false)
  }, [isInteractive])

  useEffect(() => {
    if (!open) return

    updateMenuPosition()

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div
      className="absolute left-2 top-2 z-[130]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "btn btn-circle btn-xs border shadow transition",
          allocationStatusButtonClass(status.state),
        )}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => {
          if (!isInteractive) return
          updateMenuPosition()
          setOpen((current) => !current)
        }}
      >
        <AllocationStatusIcon state={status.state} className="h-4 w-4" />
      </button>
      {open && isInteractive
        ? createPortal(
            <div
              ref={menuRef}
              tabIndex={0}
              className="fixed z-[1000] max-h-[calc(100dvh-2rem)] w-80 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-3 text-sm shadow-2xl"
              style={menuPosition}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="space-y-1">
                <p className="font-black">{label}</p>
                <p className="text-xs leading-5 text-base-content/70">
                  {allocationStatusSummary(status)}
                </p>
              </div>

              {error ? (
                <p className="mt-3 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                  {error}
                </p>
              ) : null}

              {status.candidates.length === 0 ? (
                <div className="mt-3 text-sm text-base-content/60">
                  No matching owned printings.
                </div>
              ) : (
                <ul className="menu mt-3 p-0 text-sm">
                  {status.candidates.map((candidate) => (
                    <li key={candidate.item.id} className="rounded-box">
                      <div className="block space-y-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {collectionItemLabel(candidate.item)}
                          </p>
                          <p className="text-xs text-base-content/60">
                            {allocationCandidateSummary(candidate)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            disabled={
                              isUpdating ||
                              candidate.available <= 0 ||
                              status.allocated >= status.required
                            }
                            onClick={() => onAllocate(candidate.item.id)}
                          >
                            Allocate
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            disabled={isUpdating || candidate.allocated <= 0}
                            onClick={() => onDeallocate(candidate.item.id)}
                          >
                            Deallocate
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function allocationStatusLabel(status: DeckCardEntry["allocationStatus"]) {
  if (status.state === "allocated") return "Fully allocated"
  if (status.state === "available") return "Available to allocate"
  if (status.state === "partial") return "Partially available"
  if (status.state === "basic_land") return "Basic land"
  return "Missing from collection"
}

function allocationStatusSummary(status: DeckCardEntry["allocationStatus"]) {
  if (status.state === "allocated") return `${status.allocated} allocated`
  if (status.state === "basic_land") return "Basic lands do not need collection copies"

  const needed = Math.max(status.required - status.allocated, 0)

  if (status.available > 0) return `${status.available} free of ${needed} needed`
  if (status.missing > 0 && status.allocated > 0)
    return `${status.allocated} allocated · ${status.missing} missing`
  if (status.missing > 0) return `${status.owned} owned · ${status.missing} missing`

  return `${status.required} needed`
}

function allocationCandidateSummary(
  candidate: DeckCardEntry["allocationStatus"]["candidates"][number],
) {
  return [
    `${candidate.available} free`,
    candidate.allocated ? `${candidate.allocated} here` : null,
    candidate.allocatedElsewhere ? `${candidate.allocatedElsewhere} elsewhere` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function allocationStatusButtonClass(state: string) {
  if (state === "allocated")
    return "border-success/40 bg-success/90 text-success-content hover:bg-success"
  if (state === "available")
    return "border-primary/40 bg-primary/90 text-primary-content hover:bg-primary"
  if (state === "partial")
    return "border-warning/40 bg-warning/90 text-warning-content hover:bg-warning"
  if (state === "basic_land") return "border-info/40 bg-info/90 text-info-content hover:bg-info"
  return "border-error/40 bg-error/90 text-error-content hover:bg-error"
}

function AllocationStatusIcon({ className, state }: { className?: string; state: string }) {
  if (state === "allocated") return <CheckCircle2 className={className} />
  if (state === "available" || state === "basic_land") return <Circle className={className} />
  if (state === "partial") return <AlertTriangle className={className} />
  return <XCircle className={className} />
}

function collectionItemLabel(
  item: DeckCardEntry["allocationStatus"]["candidates"][number]["item"],
) {
  const printing = item.printing
  const setLabel = [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  const location = item.location?.name || "Unfiled"
  return [setLabel || printing?.setName, titleize(item.finish), location]
    .filter(Boolean)
    .join(" · ")
}

function DeckZoneTable({
  cards,
  isUpdating,
  onDelete,
  onEdit,
  onMove,
  title,
}: {
  cards: DeckCardEntry[]
  isUpdating: boolean
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  title: string
}) {
  if (!cards.length) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black tracking-normal marker:hidden">
        <span className="flex items-center gap-2">
          <Box className="h-4 w-4 text-warning" />
          {title}
          <span className="text-base-content/55">
            ({cards.reduce((total, deckCard) => total + deckCard.quantity, 0)})
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="overflow-x-auto border-t border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-14">Qty</th>
              <th>Name</th>
              <th>Type</th>
              <th>Printing</th>
              <th className="w-36 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((deckCard) => {
              const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]

              return (
                <tr key={deckCard.id}>
                  <td className="font-mono">{deckCard.quantity}</td>
                  <td>
                    <Link
                      to="/cards/$id"
                      params={{ id: deckCard.card?.oracleId || "" }}
                      className="font-semibold hover:text-primary"
                    >
                      {deckCard.card?.name}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate text-base-content/65">
                    {deckCard.card?.typeLine}
                  </td>
                  <td className="text-base-content/65">
                    {printing?.setName || printing?.setCode?.toUpperCase() || "Unknown"} #
                    {printing?.collectorNumber || "?"}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => onEdit(deckCard)}
                        title="Edit"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => onMove(deckCard)}
                      >
                        <MoveRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-error hover:bg-error/10"
                        disabled={isUpdating}
                        onClick={() => onDelete(deckCard)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function MoveDeckCardDialog({
  deckCard,
  error,
  isPending,
  onClose,
  onMove,
  zoneCounts,
}: {
  deckCard: DeckCardEntry | null
  error: string | null
  isPending: boolean
  onClose: () => void
  onMove: (zone: DeckZone) => void
  zoneCounts: Record<DeckZone, number>
}) {
  const zoneOptions = deckCard ? MOVE_TARGET_ZONES.filter((zone) => zone !== deckCard.zone) : []
  const [selectedZone, setSelectedZone] = useState<DeckZone>("sideboard")
  const activeZone = zoneOptions.includes(selectedZone) ? selectedZone : zoneOptions[0]

  return (
    <Dialog open={Boolean(deckCard)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg" labelledBy="move-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="move-deck-card-title">Move to...</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckCard?.card?.name}</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="grid gap-2">
            {zoneOptions.map((zone) => (
              <button
                key={zone}
                type="button"
                className={[
                  "flex items-center gap-4 rounded-box border p-4 text-left transition",
                  activeZone === zone
                    ? "border-primary bg-primary/10"
                    : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                ].join(" ")}
                onClick={() => setSelectedZone(zone)}
              >
                <ZoneIcon zone={zone} />
                <span>
                  <span className="block text-lg font-semibold">{titleize(zone)}</span>
                  <span className="text-sm text-base-content/60">
                    {zoneCounts[zone] || 0} cards
                  </span>
                </span>
              </button>
            ))}
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !activeZone}
              onClick={() => activeZone && onMove(activeZone)}
            >
              Move
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditDeckCardDialog({
  deckCard,
  deckFormat,
  error,
  isPending,
  onClose,
  onSave,
}: {
  deckCard: DeckCardEntry | null
  deckFormat: string
  error: string | null
  isPending: boolean
  onClose: () => void
  onSave: (input: DeckCardUpdateInput) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [preferredPrintingId, setPreferredPrintingId] = useState("")
  const zoneOptions = deckFormat === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const printings = (deckCard?.card?.printings || []).filter(present)
  const selectedPrinting = preferredPrintingId
    ? printings.find((printing) => printing.scryfallId === preferredPrintingId) ||
      deckCard?.preferredPrinting
    : null
  const finishOptions = preferredPrintingId
    ? printingFinishOptions(selectedPrinting?.finishes)
    : DECK_CARD_FINISHES

  useEffect(() => {
    if (!deckCard) {
      setQuantity(1)
      setZone("mainboard")
      setFinish("nonfoil")
      setPreferredPrintingId("")
      return
    }

    setQuantity(deckCard.quantity)
    setZone(deckCard.zone as DeckZone)
    setFinish(deckCard.finish || "nonfoil")
    setPreferredPrintingId(deckCard.preferredPrinting?.scryfallId || "")
  }, [deckCard])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({
      quantity,
      zone,
      finish,
      preferredPrintingId: preferredPrintingId || null,
    })
  }

  return (
    <Dialog open={Boolean(deckCard)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-xl" labelledBy="edit-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-deck-card-title">Edit card</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckCard?.card?.name}</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Printing</div>
            <div className="max-h-80 overflow-y-auto rounded-box border border-base-300 p-2">
              <div className="grid gap-2">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-box border p-3 text-left transition",
                    preferredPrintingId === ""
                      ? "border-primary bg-primary/10"
                      : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                  )}
                  disabled={isPending}
                  onClick={() => setPreferredPrintingId("")}
                  autoFocus
                >
                  <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-base-200 text-base-content/50">
                    <Layers className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">Any printing</span>
                    <span className="block text-xs text-base-content/60">
                      Use any matching copy when allocating this card.
                    </span>
                  </span>
                </button>
                {printings.map((printing) => (
                  <button
                    key={printing.scryfallId}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 rounded-box border p-3 text-left transition",
                      preferredPrintingId === printing.scryfallId
                        ? "border-primary bg-primary/10"
                        : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                    )}
                    disabled={isPending}
                    onClick={() => setPreferredPrintingId(printing.scryfallId)}
                  >
                    {printing.imageUrl ? (
                      <img
                        src={printing.imageUrl}
                        alt=""
                        className="h-16 w-12 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-base-200 text-base-content/50">
                        <Palette className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {deckCardPrintingOptionLabel(printing)}
                      </span>
                      <span className="block truncate text-xs text-base-content/60">
                        {printingFinishOptions(printing.finishes).map(titleize).join(", ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Quantity</span>
              <Input
                type="number"
                min={1}
                value={quantity}
                disabled={isPending}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Zone</span>
              <select
                className="select select-bordered w-full"
                value={zone}
                disabled={isPending}
                onChange={(event) => setZone(event.target.value as DeckZone)}
              >
                {zoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {titleize(zone)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <select
                className="select select-bordered w-full"
                value={finish}
                disabled={isPending}
                onChange={(event) => setFinish(event.target.value)}
              >
                {finishOptions.map((finish) => (
                  <option key={finish} value={finish}>
                    {titleize(finish)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !deckCard}>
              {isPending ? "Saving..." : "Save card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function deckCardPrintingOptionLabel(printing: DeckCardPrinting) {
  return [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
    printing?.setName,
    printing?.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function printingFinishOptions(finishes?: Array<string | null> | null) {
  const options = (finishes || []).filter(
    (finish): finish is string =>
      typeof finish === "string" && DECK_CARD_FINISHES.includes(finish),
  )

  return options.length ? options : DECK_CARD_FINISHES
}

function ImportDecklistDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const [result, setResult] = useState<{
    imported: number
    unresolved: string[]
    skippedPrintings: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importDecklist = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(ImportDecklistDocument, { id: deck.id, text })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deck", deck?.id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setResult(data.importDecklist || null)
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not import decklist"),
  })

  useEffect(() => {
    if (!open) {
      setText("")
      setResult(null)
      setError(null)
    }
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (!text.trim()) {
      setError("Paste a decklist to import")
      return
    }

    importDecklist.mutate()
  }

  function close() {
    if (importDecklist.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl" labelledBy="import-decklist-title">
        <DialogHeader>
          <div>
            <DialogTitle id="import-decklist-title">Import decklist</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Decklist text
            </span>
            <textarea
              className="textarea textarea-bordered min-h-80 w-full bg-base-100 font-mono text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"Commander\n1 Sol Ring\n1 Arcane Signet\n\nSideboard\n2 Negate"}
              autoFocus
            />
          </label>

          {result ? (
            <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
              <div className="font-black">{result.imported} cards imported</div>
              {result.unresolved.length ? (
                <div className="mt-2 text-warning">Unresolved: {result.unresolved.join(", ")}</div>
              ) : null}
              {result.skippedPrintings.length ? (
                <div className="mt-2 text-base-content/65">
                  Skipped preferred printings: {result.skippedPrintings.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={importDecklist.isPending}
            >
              Close
            </Button>
            <Button type="submit" disabled={importDecklist.isPending}>
              <Upload className="h-4 w-4" />
              {importDecklist.isPending ? "Importing..." : "Import decklist"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddDeckCardDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const zoneOptions = deck?.format === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const addDeckCard = useMutation({
    mutationFn: () =>
      request(AddDeckCardDocument, {
        deckId: deck?.id || "",
        input: {
          name: name.trim(),
          quantity,
          zone,
          finish,
        },
      }),
    onSuccess: () => {
      if (deck?.id) {
        queryClient.invalidateQueries({ queryKey: ["deck", deck.id] })
        queryClient.invalidateQueries({ queryKey: ["deck-buylist", deck.id] })
      }
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setName("")
      setQuantity(1)
      setZone("mainboard")
      setFinish("nonfoil")
      setError(null)
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not add card to deck"),
  })

  useEffect(() => {
    if (!open) {
      setName("")
      setQuantity(1)
      setZone("mainboard")
      setFinish("nonfoil")
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Choose a card.")
      return
    }
    addDeckCard.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" labelledBy="add-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-deck-card-title">Add card</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-semibold">Card</span>
            <CardNameSearchField
              value={name}
              onValueChange={setName}
              onSuggestionSelect={setName}
              placeholder="Search card name"
              disabled={addDeckCard.isPending}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Quantity</span>
              <Input
                type="number"
                min={1}
                value={quantity}
                disabled={addDeckCard.isPending}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Zone</span>
              <select
                className="select select-bordered w-full"
                value={zone}
                disabled={addDeckCard.isPending}
                onChange={(event) => setZone(event.target.value as DeckZone)}
              >
                {zoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {titleize(zone)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <select
                className="select select-bordered w-full"
                value={finish}
                disabled={addDeckCard.isPending}
                onChange={(event) => setFinish(event.target.value)}
              >
                <option value="nonfoil">Nonfoil</option>
                <option value="foil">Foil</option>
                <option value="etched">Etched</option>
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={addDeckCard.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addDeckCard.isPending || !name.trim()}>
              {addDeckCard.isPending ? "Adding..." : "Add card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MissingCardsDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [printingMode, setPrintingMode] = useState<BuylistPrintingMode>("none")
  const [exportFormat, setExportFormat] = useState<BuylistExportFormat>("text")
  const [includeBasicLands, setIncludeBasicLands] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const buylistQuery = useQuery({
    queryKey: ["deck-buylist", deck?.id, printingMode, exportFormat, includeBasicLands],
    queryFn: () =>
      request(DeckBuylistDocument, {
        id: deck?.id || "",
        printingMode,
        exportFormat,
        includeBasicLands,
      }),
    enabled: open && Boolean(deck?.id),
  })
  const entries = buylistQuery.data?.deckBuylist || []
  const exportText = buylistQuery.data?.deckBuylistExport || ""
  const hasBuylistEntries = entries.length > 0

  useEffect(() => {
    if (!open) setCopyState("idle")
  }, [open])

  async function copyExportText() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopyState("copied")
    } catch (_error) {
      setCopyState("failed")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" labelledBy="missing-cards-title">
        <DialogHeader>
          <div>
            <DialogTitle id="missing-cards-title">Missing cards</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!exportText}
              onClick={copyExportText}
            >
              <Clipboard className="h-4 w-4" />
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
            <DialogClose onClose={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Printing
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={printingMode}
                onChange={(event) => setPrintingMode(event.target.value as BuylistPrintingMode)}
              >
                <option value="none">Any printing</option>
                <option value="exact">Exact preferred printing</option>
                <option value="cheapest">Cheapest known printing</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Export
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as BuylistExportFormat)}
              >
                <option value="text">Plain text</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <label className="label cursor-pointer justify-start gap-2 self-end rounded-btn border border-base-300 px-3 py-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={includeBasicLands}
                onChange={(event) => setIncludeBasicLands(event.target.checked)}
              />
              <span className="label-text text-sm">Include basic lands</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form
              action="https://www.cardkingdom.com/builder"
              method="post"
              target="_blank"
              className="inline-flex"
            >
              <input type="hidden" name="c" value={vendorBuylistPipeText(entries)} />
              <input type="hidden" name="partner" value="manavault" />
              <input type="hidden" name="po_origin" value="1" />
              <input type="hidden" name="partner_args" value="manavault,buylist" />
              <Button type="submit" variant="outline" size="sm" disabled={!hasBuylistEntries}>
                <Store className="h-4 w-4" />
                Card Kingdom
              </Button>
            </form>

            {hasBuylistEntries ? (
              <Button asChild variant="outline" size="sm">
                <a href={manaPoolBuylistUrl(entries)} target="_blank" rel="noreferrer">
                  <Database className="h-4 w-4" />
                  Mana Pool
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <Database className="h-4 w-4" />
                Mana Pool
              </Button>
            )}

            {hasBuylistEntries ? (
              <Button asChild variant="outline" size="sm">
                <a href={tcgplayerBuylistUrl(entries)} target="_blank" rel="noreferrer">
                  <ShoppingCart className="h-4 w-4" />
                  TCGplayer
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <ShoppingCart className="h-4 w-4" />
                TCGplayer
              </Button>
            )}
          </div>

          <div className="rounded-box border border-base-300 bg-base-200/60 px-4 py-3 text-sm text-base-content/70">
            {buylistQuery.isLoading ? "Loading buylist..." : buylistSummary(entries)}
          </div>

          {buylistQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {buylistQuery.error instanceof Error
                ? buylistQuery.error.message
                : "Could not load missing cards"}
            </p>
          ) : null}

          {!buylistQuery.isLoading && !entries.length ? (
            <EmptyState title="No missing or unavailable cards for this deck" />
          ) : null}

          {entries.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-16">Qty</th>
                    <th>Card</th>
                    <th>Reason</th>
                    <th>Printing</th>
                    <th className="text-right">Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={`${entry.cardName}-${entry.setCode || "any"}-${
                        entry.collectorNumber || ""
                      }`}
                    >
                      <td className="font-black">{entry.quantity}</td>
                      <td>{entry.cardName}</td>
                      <td>
                        <Badge tone={buylistReasonTone(entry)}>{entry.reason}</Badge>
                      </td>
                      <td className="whitespace-nowrap">{buylistPrintingLabel(entry)}</td>
                      <td className="text-right font-mono">{entry.totalPriceText || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <textarea
            className="textarea textarea-bordered min-h-48 w-full bg-base-100 font-mono text-xs"
            readOnly
            value={buylistQuery.isLoading ? "Exporting..." : exportText}
          />
          {copyState === "failed" ? (
            <p className="text-sm text-error">Could not copy from this browser context.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExportDecklistDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const exportQuery = useQuery({
    queryKey: ["deck-export-text", deck?.id],
    queryFn: () => request(DeckExportTextDocument, { id: deck?.id || "" }),
    enabled: open && Boolean(deck?.id),
  })
  const exportText = exportQuery.data?.deckExportText || ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="export-decklist-title">
        <DialogHeader>
          <div>
            <DialogTitle id="export-decklist-title">Export decklist</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <textarea
            className="textarea textarea-bordered min-h-80 w-full bg-base-100 font-mono text-sm"
            readOnly
            value={exportQuery.isLoading ? "Exporting..." : exportText}
          />
          {exportQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {exportQuery.error instanceof Error
                ? exportQuery.error.message
                : "Could not export decklist"}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditDeckDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckSummary | DeckDetail | null
  onOpenChange: (open: boolean) => void
  open?: boolean
}) {
  const queryClient = useQueryClient()
  const isOpen = open ?? Boolean(deck)
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!deck || !isOpen) return
    setName(deck.name)
    setFormat(deckFormatValue(deck.format))
    setStatus(deckStatusValue(deck.status))
    setError(null)
  }, [deck, isOpen])

  const updateDeck = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(UpdateDeckDocument, {
        id: deck.id,
        input: { name: name.trim(), format, status },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      if (deck) queryClient.invalidateQueries({ queryKey: ["deck", deck.id] })
      setError(null)
      onOpenChange(false)
    },
    onError: (error) => setError(error instanceof Error ? error.message : "Could not update deck"),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Deck name is required")
      return
    }

    updateDeck.mutate()
  }

  function close() {
    if (updateDeck.isPending) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="edit-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-deck-title">Edit deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">Update deck metadata.</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deck name"
              autoFocus
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Format
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={(event) => setFormat(deckFormatValue(event.target.value))}
              >
                {DECK_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Status
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={(event) => setStatus(deckStatusValue(event.target.value))}
              >
                {DECK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleize(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={updateDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateDeck.isPending}>
              <Edit3 className="h-4 w-4" />
              {updateDeck.isPending ? "Saving..." : "Save deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function deckFormatValue(value: string): (typeof DECK_FORMATS)[number] {
  return DECK_FORMATS.find((format) => format === value) || "commander"
}

function deckStatusValue(value: string): (typeof DECK_STATUSES)[number] {
  return DECK_STATUSES.find((status) => status === value) || "brewing"
}

function NewDeckDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  const createDeck = useMutation({
    mutationFn: () => request(CreateDeckDocument, { input: { name: name.trim(), format, status } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setName("")
      setFormat("commander")
      setStatus("brewing")
      setError(null)
      onOpenChange(false)

      if (data.createDeck?.id) {
        navigate({ to: "/decks/$id", params: { id: data.createDeck.id } })
      }
    },
    onError: (error) => setError(error instanceof Error ? error.message : "Could not create deck"),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Deck name is required")
      return
    }

    createDeck.mutate()
  }

  function close() {
    if (createDeck.isPending) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="new-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="new-deck-title">New deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Start with a shell, then import or add cards from the catalog.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deck name"
              autoFocus
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Format
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={(event) => setFormat(event.target.value as (typeof DECK_FORMATS)[number])}
              >
                {DECK_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Status
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as (typeof DECK_STATUSES)[number])
                }
              >
                {DECK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleize(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={createDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeck.isPending}>
              <Plus className="h-4 w-4" />
              {createDeck.isPending ? "Creating..." : "Create deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
