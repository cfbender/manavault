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
  Play,
  Plus,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trash2,
  Upload,
  WandSparkles,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { PageHeader, PageSection } from "../components/app-shell"
import { CardNameSearchField } from "../components/card-name-search-field"
import { EmptyState } from "../components/card-image"
import { ImageSummaryCard } from "../components/image-summary-card"
import { DeckPlaytester } from "../components/deck-playtester"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { ConfirmDialog } from "../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { ColorIdentitySymbols } from "../components/ui/mana-symbols"
import { graphql } from "../gql"
import type {
  DeckBuylistQuery,
  DeckCardInput,
  DeckCardUpdateInput,
  DeckEdhrecQuery,
  DeckQuery,
  DecksQuery,
  PreviewBulkAllocateDeckMutation,
} from "../gql/graphql"
import { request } from "../lib/graphql"
import { createPlaytestState, type PlaytestCard } from "../lib/deck-playtest"
import { cn, compactNumber, present, titleize } from "../lib/utils"

const DecksDocument = graphql(`
  query Decks {
    decks {
      id
      name
      format
      status
      shareToken
      coverImageUrl
      commanderColorIdentity
      cardCount
      uniqueCardCount
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
      shareToken
      coverImageUrl
      commanderColorIdentity
      cardCount
      uniqueCardCount
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
      shareToken
      coverImageUrl
      commanderColorIdentity
      cardCount
      uniqueCardCount
    }
  }
`)

const DeleteDeckDocument = graphql(`
  mutation DeleteDeck($id: ID!) {
    deleteDeck(id: $id) {
      id
      name
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
      shareToken
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
          proxyAllocated
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

const EnsureDeckShareTokenDocument = graphql(`
  mutation EnsureDeckShareToken($id: ID!) {
    ensureDeckShareToken(id: $id) {
      id
      shareToken
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
        proxyAllocated
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
        proxyAllocated
        available
        allocatedElsewhere
        missing
      }
    }
  }
`)

const AllocateDeckCardProxyDocument = graphql(`
  mutation AllocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    allocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      id
      allocationStatus {
        state
        required
        owned
        allocated
        proxyAllocated
        available
        allocatedElsewhere
        missing
      }
    }
  }
`)

const DeallocateDeckCardProxyDocument = graphql(`
  mutation DeallocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    deallocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      id
      allocationStatus {
        state
        required
        owned
        allocated
        proxyAllocated
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
  mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!) {
    importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
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

const DeckEdhrecDocument = graphql(`
  query DeckEdhrec($id: ID!, $excludeLands: Boolean!) {
    deckEdhrec(id: $id, excludeLands: $excludeLands) {
      commanderNames
      more
      recommendations {
        name
        oracleId
        primaryType
        score
        salt
        edhrecUrl
        card {
          oracleId
          name
          typeLine
          printings {
            scryfallId
            imageUrl
            artCropUrl
            priceText
          }
        }
        collectionStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          candidates {
            available
          }
        }
      }
      cuts {
        name
        oracleId
        primaryType
        score
        salt
        edhrecUrl
        card {
          oracleId
          name
          typeLine
          printings {
            scryfallId
            imageUrl
            artCropUrl
            priceText
          }
        }
        collectionStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          candidates {
            available
          }
        }
      }
      commanderPages {
        name
        title
        description
        url
        rank
        deckCount
        salt
        avgPrice
        colorIdentity
        similar
        themes {
          name
          slug
          count
        }
        stats {
          label
          value
        }
        sections {
          header
          tag
          cards {
            name
            oracleId
            synergy
            inclusion
            numDecks
            potentialDecks
            url
            card {
              oracleId
              name
              typeLine
              printings {
                scryfallId
                imageUrl
                artCropUrl
                priceText
              }
            }
            collectionStatus {
              state
              required
              owned
              allocated
              available
              allocatedElsewhere
              missing
              candidates {
                available
              }
            }
          }
        }
      }
    }
  }
`)

export function DecksPage() {
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
  const [editingDeck, setEditingDeck] = useState<DeckSummary | null>(null)
  const [sharingDeck, setSharingDeck] = useState<DeckSummary | null>(null)
  const [deletingDeck, setDeletingDeck] = useState<DeckSummary | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deleteDeck = useMutation({
    mutationFn: (deckId: string) => request(DeleteDeckDocument, { id: deckId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
    },
  })
  const { data, isLoading } = useQuery({
    queryKey: ["decks"],
    queryFn: () => request(DecksDocument),
  })
  const deckGroups = groupDecksByFormat(data?.decks || [])

  function deleteSelectedDeck() {
    if (!deletingDeck) return
    deleteDeck.mutate(deletingDeck.id)
    if (editingDeck?.id === deletingDeck.id) setEditingDeck(null)
    if (sharingDeck?.id === deletingDeck.id) setSharingDeck(null)
    navigate({ to: "/decks" })
  }
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
                          imageUrl={deck.coverImageUrl}
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
                          nameLine={
                            <DeckNameWithCommanderIdentity
                              colors={deck.commanderColorIdentity}
                              name={deck.name}
                            />
                          }
                        />
                      </Link>
                      <SummaryActionMenu
                        label={`${deck.name} actions`}
                        onEdit={() => setEditingDeck(deck)}
                        onShare={() => setSharingDeck(deck)}
                        onDelete={() => setDeletingDeck(deck)}
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
      <ShareDeckDialog deck={sharingDeck} onOpenChange={(open) => !open && setSharingDeck(null)} />
      <ConfirmDialog
        destructive
        confirmLabel="Delete deck"
        open={Boolean(deletingDeck)}
        title={deletingDeck ? `Delete ${deletingDeck.name}?` : "Delete deck?"}
        onConfirm={deleteSelectedDeck}
        onOpenChange={(open) => !open && setDeletingDeck(null)}
      >
        This removes the deck and returns allocated cards to their original locations.
      </ConfirmDialog>
    </>
  )
}

export function DeckDetailPage({
  edhrecExcludeLands = false,
  edhrecTab,
  id,
  shareMode = false,
}: {
  edhrecExcludeLands?: boolean
  edhrecTab?: EDHRecTab
  id: string
  shareMode?: boolean
}) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("type")
  const [editTarget, setEditTarget] = useState<DeckCardEntry | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<DeckCardEntry | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [deleteCardTarget, setDeleteCardTarget] = useState<DeckCardEntry | null>(null)
  const [isDeleteDeckOpen, setIsDeleteDeckOpen] = useState(false)
  const [isEditDeckOpen, setIsEditDeckOpen] = useState(false)
  const [isImportDeckOpen, setIsImportDeckOpen] = useState(false)
  const [isExportDeckOpen, setIsExportDeckOpen] = useState(false)
  const [isMissingCardsOpen, setIsMissingCardsOpen] = useState(false)
  const [isShareDeckOpen, setIsShareDeckOpen] = useState(false)
  const [bulkAllocationPreview, setBulkAllocationPreview] = useState<BulkAllocationPreview | null>(
    null,
  )
  const [bulkAllocationError, setBulkAllocationError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deleteDeck = useMutation({
    mutationFn: (deckId: string) => request(DeleteDeckDocument, { id: deckId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.removeQueries({ queryKey: ["deck", id] })
      navigate({ to: "/decks" })
    },
  })
  const { data, isLoading } = useQuery({
    queryKey: [shareMode ? "shared-deck" : "deck", id],
    queryFn: () =>
      request(DeckDocument, { id }, shareMode ? { endpoint: "/share/graphql" } : undefined),
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
      !shareMode &&
      deckCards.some(
        (deckCard) =>
          deckCard.allocationStatus.available > 0 &&
          deckCard.allocationStatus.allocated < deckCard.allocationStatus.required,
      ),
    [deckCards, shareMode],
  )

  const updateDeckCard = useMutation({
    mutationFn: ({ deckCardId, input }: { deckCardId: string; input: DeckCardUpdateInput }) =>
      request(UpdateDeckCardDocument, { id: deckCardId, input }),
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
  const addDeckCard = useMutation({
    mutationFn: (input: DeckCardInput) => request(AddDeckCardDocument, { deckId: id, input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      queryClient.invalidateQueries({ queryKey: ["deck-edhrec", id] })
    },
  })

  function invalidateAllocationQueries() {
    queryClient.invalidateQueries({ queryKey: ["deck", id] })
    queryClient.invalidateQueries({ queryKey: ["decks"] })
    queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
    queryClient.invalidateQueries({ queryKey: ["deck-edhrec", id] })
    queryClient.invalidateQueries({ queryKey: ["collection"] })
    queryClient.invalidateQueries({ queryKey: ["collection-items"] })
  }

  const allocateDeckCardItem = useMutation({
    mutationFn: ({
      collectionItemId,
      deckCardId,
    }: {
      collectionItemId: string
      deckCardId: string
    }) => request(AllocateDeckCardItemDocument, { deckCardId, collectionItemId }),
    onSuccess: () => {
      invalidateAllocationQueries()
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
      invalidateAllocationQueries()
    },
  })
  const allocateDeckCardProxy = useMutation({
    mutationFn: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      request(AllocateDeckCardProxyDocument, { deckCardId, quantity }),
    onSuccess: () => {
      invalidateAllocationQueries()
    },
  })
  const deallocateDeckCardProxy = useMutation({
    mutationFn: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      request(DeallocateDeckCardProxyDocument, { deckCardId, quantity }),
    onSuccess: () => {
      invalidateAllocationQueries()
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
        : allocateDeckCardProxy.error instanceof Error
          ? allocateDeckCardProxy.error.message
          : deallocateDeckCardProxy.error instanceof Error
            ? deallocateDeckCardProxy.error.message
            : deleteDeckCard.error instanceof Error
              ? deleteDeckCard.error.message
              : null
  const isUpdatingDeckCard =
    updateDeckCard.isPending ||
    deleteDeckCard.isPending ||
    setDeckCommander.isPending ||
    allocateDeckCardItem.isPending ||
    deallocateDeckCardItem.isPending ||
    allocateDeckCardProxy.isPending ||
    deallocateDeckCardProxy.isPending

  if (isLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

  function moveDeckCard(deckCard: DeckCardEntry, zone: DeckZone) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input: { zone } })
  }

  function editDeckCard(deckCard: DeckCardEntry, input: DeckCardUpdateInput) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input })
  }

  function deleteSelectedDeckCard() {
    if (!deleteCardTarget) return
    deleteDeckCard.mutate(deleteCardTarget.id)
  }

  function deleteCurrentDeck() {
    if (!deck) return
    deleteDeck.mutate(deck.id)
  }

  function addEdhrecCard(card: EDHRecCard | EDHRecSectionCard) {
    addDeckCard.mutate({
      finish: "nonfoil",
      name: card.name,
      preferredPrintingId: edhrecCardPrintingId(card),
      quantity: 1,
      zone: "mainboard",
    })
  }

  function setEdhrecState(tab: EDHRecTab | undefined, excludeLands = edhrecExcludeLands) {
    navigate({
      to: "/decks/$id",
      params: { id },
      search: {
        edhrec: tab,
        edhrecExcludeLands: tab && excludeLands ? true : undefined,
      },
    })
  }

  return (
    <>
      <div className="space-y-7">
        <ShareModeHidden shareMode={shareMode}>
          <Button asChild variant="outline" size="sm">
            <Link to="/decks">Back to decks</Link>
          </Button>
        </ShareModeHidden>

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
          nameLine={
            <DeckNameWithCommanderIdentity
              colors={commanderColorIdentity(deckCards)}
              name={deck.name}
            />
          }
          actionSlot={
            <ShareModeHidden shareMode={shareMode}>
              <SummaryActionMenu
                label={`${deck.name} actions`}
                onEdit={() => setIsEditDeckOpen(true)}
                onExport={() => setIsExportDeckOpen(true)}
                onImport={() => setIsImportDeckOpen(true)}
                onMissing={() => setIsMissingCardsOpen(true)}
                onShare={() => setIsShareDeckOpen(true)}
                onDelete={() => setIsDeleteDeckOpen(true)}
                onEdhrec={deck.format === "commander" ? () => setEdhrecState("recs") : undefined}
              />
            </ShareModeHidden>
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
            <ShareModeHidden shareMode={shareMode}>
              <Button asChild variant="outline" size="sm">
                <Link to="/decks/$id/playtest" params={{ id: deck.id }}>
                  <Play className="h-4 w-4" />
                  Playtest
                </Link>
              </Button>
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
            </ShareModeHidden>
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
            onToggleProxy={(deckCard) => {
              const status = deckCard.allocationStatus

              if (status.proxyAllocated > 0) {
                deallocateDeckCardProxy.mutate({
                  deckCardId: deckCard.id,
                  quantity: status.proxyAllocated,
                })
              } else {
                const quantity = Math.max(status.required - status.allocated, 0)

                if (quantity > 0) {
                  allocateDeckCardProxy.mutate({ deckCardId: deckCard.id, quantity })
                }
              }
            }}
            onDelete={setDeleteCardTarget}
            onSetCommander={(deckCard) => setDeckCommander.mutate(deckCard.id)}
            allocationError={allocationError}
            shareMode={shareMode}
          />
        ) : (
          <EmptyState title="No cards in this deck" />
        )}

        <div className="space-y-3">
          <DeckZoneTable
            cards={sideboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Sideboard"
            shareMode={shareMode}
            onMove={(deckCard) => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onEdit={(deckCard) => {
              setEditError(null)
              setEditTarget(deckCard)
            }}
            onDelete={setDeleteCardTarget}
          />
          <DeckZoneTable
            cards={maybeboardCards}
            isUpdating={isUpdatingDeckCard}
            title="Maybeboard"
            shareMode={shareMode}
            onMove={(deckCard) => {
              setMoveError(null)
              setMoveTarget(deckCard)
            }}
            onEdit={(deckCard) => {
              setEditError(null)
              setEditTarget(deckCard)
            }}
            onDelete={setDeleteCardTarget}
          />
        </div>
      </div>

      <ShareModeHidden shareMode={shareMode}>
        <EditDeckDialog deck={deck} onOpenChange={setIsEditDeckOpen} open={isEditDeckOpen} />
        <ShareDeckDialog deck={deck} onOpenChange={setIsShareDeckOpen} open={isShareDeckOpen} />
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
        <ConfirmDialog
          destructive
          confirmLabel="Delete deck"
          open={isDeleteDeckOpen}
          title={`Delete ${deck.name}?`}
          onConfirm={deleteCurrentDeck}
          onOpenChange={setIsDeleteDeckOpen}
        >
          This removes the deck and returns allocated cards to their original locations.
        </ConfirmDialog>
        <ConfirmDialog
          destructive
          confirmLabel="Delete card"
          open={Boolean(deleteCardTarget)}
          title={`Delete ${deleteCardTarget?.card?.name || "this card"} from this deck?`}
          onConfirm={deleteSelectedDeckCard}
          onOpenChange={(open) => !open && setDeleteCardTarget(null)}
        />
        <EDHRecDialog
          activeTab={edhrecTab || "recs"}
          addCardError={addDeckCard.error instanceof Error ? addDeckCard.error.message : null}
          deck={deck}
          excludeLands={edhrecExcludeLands}
          isAddingCard={addDeckCard.isPending}
          onAddCard={addEdhrecCard}
          onExcludeLandsChange={(excludeLands) => setEdhrecState(edhrecTab || "recs", excludeLands)}
          onOpenChange={(open) => {
            if (!open) setEdhrecState(undefined, false)
            else setEdhrecState(edhrecTab || "recs")
          }}
          onTabChange={(tab) => setEdhrecState(tab)}
          open={Boolean(edhrecTab)}
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
      </ShareModeHidden>
    </>
  )
}

export function DeckPlaytestPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["deck", id],
    queryFn: () => request(DeckDocument, { id }),
  })
  const deck = data?.deck
  const deckCards = useMemo(() => (deck?.deckCards || []).filter(present), [deck?.deckCards])
  const playtestCards = useMemo(() => deckPlaytestCards(deckCards), [deckCards])
  const initialState = useMemo(
    () => createPlaytestState(playtestCards.library, playtestCards.command),
    [playtestCards],
  )

  if (isLoading) return <EmptyState title="Loading playtest..." />
  if (!deck) return <EmptyState title="Deck not found" />

  return <DeckPlaytester deckId={deck.id} deckName={deck.name} initialState={initialState} />
}

type DeckSummary = DecksQuery["decks"][number]
type DeckDetail = NonNullable<DeckQuery["deck"]>
type DeckCardEntry = NonNullable<NonNullable<DeckDetail["deckCards"]>[number]>
type DeckCardPrinting = NonNullable<
  NonNullable<NonNullable<DeckCardEntry["card"]>["printings"]>[number]
>
type DeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"
type DeckGroupBy = "type" | "color" | "colorIdentity" | "manaValue" | "rarity" | "set" | "none"
type BulkAllocationMode = "exact_printings" | "matching_printings"
type BulkAllocationPreview = NonNullable<PreviewBulkAllocateDeckMutation["previewBulkAllocateDeck"]>
type BuylistPrintingMode = "none" | "exact" | "cheapest"
type BuylistExportFormat = "text" | "csv"
type BuylistEntry = DeckBuylistQuery["deckBuylist"][number]
type EDHRecData = NonNullable<DeckEdhrecQuery["deckEdhrec"]>
type EDHRecCard = EDHRecData["recommendations"][number]
type EDHRecCommanderPage = EDHRecData["commanderPages"][number]
type EDHRecSection = EDHRecCommanderPage["sections"][number]
type EDHRecSectionCard = EDHRecSection["cards"][number]
type EDHRecCollectionStatus = EDHRecCard["collectionStatus"] | EDHRecSectionCard["collectionStatus"]
export type EDHRecTab = "recs" | "cuts" | "commander"
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

function blurFocusedMenuItem(event: ReactMouseEvent<HTMLElement>) {
  const activeElement = event.currentTarget.ownerDocument.activeElement

  if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
    activeElement.blur()
  }
}

function ShareModeHidden({ children, shareMode }: { children: ReactNode; shareMode?: boolean }) {
  if (shareMode) return null
  return <>{children}</>
}

function SummaryActionMenu({
  label,
  onDelete,
  onEdhrec,
  onEdit,
  onExport,
  onImport,
  onMissing,
  onShare,
}: {
  label: string
  onDelete?: () => void
  onEdhrec?: () => void
  onEdit: () => void
  onExport?: () => void
  onImport?: () => void
  onMissing?: () => void
  onShare?: () => void
}) {
  return (
    <div
      className="dropdown dropdown-end absolute right-3 top-3 z-[80]"
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
        onClick={blurFocusedMenuItem}
      >
        <li>
          <button type="button" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </li>
        {onShare ? (
          <li>
            <button type="button" onClick={onShare}>
              <Share2 className="h-4 w-4" />
              Share deck
            </button>
          </li>
        ) : null}
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
        {onEdhrec ? (
          <li>
            <button type="button" onClick={onEdhrec}>
              <Sparkles className="h-4 w-4" />
              EDHREC
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
        {onDelete ? (
          <li>
            <button type="button" className="text-error" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete deck
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

function DeckNameWithCommanderIdentity({
  colors,
  name,
}: {
  colors?: Array<string | null> | null
  name: ReactNode
}) {
  const displayColors = colors?.filter(present) || []

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <span className="min-w-0">{name}</span>
      {displayColors.length ? (
        <ColorIdentitySymbols colors={displayColors} className="text-[0.82em]" />
      ) : null}
    </span>
  )
}

function commanderColorIdentity(
  deckCards:
    | Array<{
        card?: { colorIdentity?: Array<string | null> | null } | null
        zone?: string | null
      } | null>
    | null
    | undefined,
) {
  const commanders = (deckCards || []).filter(
    (deckCard) => deckCard?.zone === "commander" && deckCard.card,
  )

  if (!commanders.length) return null

  const colors = new Set<string>()

  for (const commander of commanders) {
    for (const color of commander?.card?.colorIdentity || []) {
      if (color) colors.add(color.toUpperCase())
    }
  }

  return colors.size
    ? Array.from(colors).sort((left, right) => colorOrder(left) - colorOrder(right))
    : ["C"]
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

function deckPlaytestCards(deckCards: DeckCardEntry[]) {
  const library: PlaytestCard[] = []
  const command: PlaytestCard[] = []

  for (const deckCard of [...deckCards].sort(compareDeckCards)) {
    if (deckCard.zone === "sideboard" || deckCard.zone === "maybeboard") continue

    const target = deckCard.zone === "commander" ? command : library
    const quantity = Math.max(deckCard.quantity || 0, 0)
    const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]

    for (let index = 0; index < quantity; index += 1) {
      target.push({
        deckCardId: deckCard.id,
        id: `${deckCard.id}:${index}`,
        imageUrl: cardImageUrl(deckCard, "imageUrl"),
        name: deckCard.card?.name || "Unknown card",
        setLabel: printing?.setCode
          ? `${printing.setCode.toUpperCase()} #${printing.collectorNumber || "?"}`
          : null,
        typeLine: deckCard.card?.typeLine,
      })
    }
  }

  return { command, library }
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
        onClick={blurFocusedMenuItem}
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
  onToggleProxy,
  shareMode = false,
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
  onToggleProxy: (deckCard: DeckCardEntry) => void
  shareMode?: boolean
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
          onToggleProxy={onToggleProxy}
          shareMode={shareMode}
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
  onToggleProxy,
  shareMode = false,
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
  onToggleProxy: (deckCard: DeckCardEntry) => void
  shareMode?: boolean
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
            onToggleProxy={() => onToggleProxy(deckCard)}
            shareMode={shareMode}
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
  onToggleProxy,
  shareMode = false,
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
  onToggleProxy: () => void
  shareMode?: boolean
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
      <ShareModeHidden shareMode={shareMode}>
        <DeckCardAllocationMenu
          deckCard={deckCard}
          error={allocationError}
          isInteractive={isInteractive}
          isUpdating={isUpdating}
          onAllocate={onAllocate}
          onDeallocate={onDeallocate}
          onToggleProxy={onToggleProxy}
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
              onClick={blurFocusedMenuItem}
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
      </ShareModeHidden>

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
  onToggleProxy,
}: {
  deckCard: DeckCardEntry
  error: string | null
  isInteractive: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onToggleProxy: () => void
}) {
  const status = deckCard.allocationStatus
  const label = allocationStatusLabel(status)
  const proxyChecked = status.proxyAllocated > 0
  const proxyQuantityToAdd = Math.max(status.required - status.allocated, 0)
  const proxyDisabled = isUpdating || (!proxyChecked && proxyQuantityToAdd <= 0)
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

              <div className="mt-3 rounded-box border border-base-300 bg-base-200/35 p-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Proxy</p>
                    <p className="truncate text-xs text-base-content/60">
                      {status.proxyAllocated} marked as proxy
                    </p>
                  </div>
                  <label className="label shrink-0 cursor-pointer gap-2 p-0">
                    <span className="label-text text-xs">
                      {proxyChecked ? "Marked" : "Mark as proxy"}
                    </span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={proxyChecked}
                      disabled={proxyDisabled}
                      aria-label={proxyChecked ? "Remove proxy" : "Mark as proxy"}
                      onChange={() => onToggleProxy()}
                    />
                  </label>
                </div>
              </div>

              {status.candidates.length === 0 ? (
                <div className="mt-3 text-sm text-base-content/60">
                  No matching owned printings.
                </div>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {status.candidates.map((candidate) => (
                    <li
                      key={candidate.item.id}
                      className="min-w-0 rounded-box border border-base-300 bg-base-200/35 p-2"
                    >
                      <div className="grid min-w-0 gap-2">
                        <div className="min-w-0">
                          <p
                            className="block max-w-full truncate font-semibold"
                            title={collectionItemLabel(candidate.item)}
                          >
                            {collectionItemLabel(candidate.item)}
                          </p>
                          <p className="truncate text-xs text-base-content/60">
                            {allocationCandidateSummary(candidate)}
                          </p>
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-xs min-w-0"
                            disabled={
                              isUpdating ||
                              candidate.available <= 0 ||
                              status.allocated >= status.required
                            }
                            onClick={() => onAllocate(candidate.item.id)}
                          >
                            <span className="truncate">Allocate</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-xs min-w-0"
                            disabled={isUpdating || candidate.allocated <= 0}
                            onClick={() => onDeallocate(candidate.item.id)}
                          >
                            <span className="truncate">Deallocate</span>
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
  const proxyText = status.proxyAllocated ? ` · ${status.proxyAllocated} proxy` : ""

  if (status.state === "allocated") return `${status.allocated} allocated${proxyText}`
  if (status.state === "basic_land") return "Basic lands do not need collection copies"

  const needed = Math.max(status.required - status.allocated, 0)

  if (status.available > 0) return `${status.available} free of ${needed} needed${proxyText}`
  if (status.missing > 0 && status.allocated > 0)
    return `${status.allocated} allocated${proxyText} · ${status.missing} missing`
  if (status.missing > 0) return `${status.owned} owned · ${status.missing} missing`

  return `${status.required} needed${proxyText}`
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
  shareMode = false,
  title,
}: {
  cards: DeckCardEntry[]
  isUpdating: boolean
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  shareMode?: boolean
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
              {shareMode ? null : <th className="w-36 text-right">Actions</th>}
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
                  {shareMode ? null : (
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
                  )}
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
    (finish): finish is string => typeof finish === "string" && DECK_CARD_FINISHES.includes(finish),
  )

  return options.length ? options : DECK_CARD_FINISHES
}

function ShareDeckDialog({
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
  const requestedDeckId = useRef<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const ensureShare = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(EnsureDeckShareTokenDocument, { id: deck.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      if (deck) queryClient.invalidateQueries({ queryKey: ["deck", deck.id] })
    },
  })
  const generatedDeck = ensureShare.data?.ensureDeckShareToken || null
  const shareToken =
    generatedDeck && generatedDeck.id === deck?.id
      ? generatedDeck.shareToken || ""
      : deck?.shareToken || ""
  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/decks/${encodeURIComponent(shareToken)}`
      : ""
  const error = ensureShare.error instanceof Error ? ensureShare.error.message : null

  useEffect(() => {
    if (!isOpen) {
      requestedDeckId.current = null
      setCopyState("idle")
      return
    }

    if (!deck?.id || shareToken || requestedDeckId.current === deck.id) return

    requestedDeckId.current = deck.id
    ensureShare.mutate()
  }, [deck?.id, ensureShare, isOpen, shareToken])

  async function copyShareUrl() {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyState("copied")
    } catch (_error) {
      setCopyState("failed")
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true)
        else onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-xl" labelledBy="share-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="share-deck-title">Share deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Public link
            </span>
            <Input readOnly value={shareUrl || "Generating link..."} />
          </label>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          {copyState === "failed" ? (
            <p className="text-sm text-error">Could not copy from this browser context.</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" disabled={!shareUrl} onClick={copyShareUrl}>
              <Clipboard className="h-4 w-4" />
              {copyState === "copied" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
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
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    unresolved: string[]
    skippedPrintings: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importDecklist = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(ImportDecklistDocument, { id: deck.id, text, replaceExisting })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deck", deck?.id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setResult(data.importDecklist || null)
      setError(null)
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not import decklist"),
  })

  useEffect(() => {
    if (!open) {
      setText("")
      setResult(null)
      setReplaceExisting(false)
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

          <label className="flex items-start gap-3 rounded-box border border-warning/30 bg-warning/10 p-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-warning checkbox-sm mt-0.5"
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
            />
            <span>
              <span className="block font-bold">Replace existing deck cards</span>
              <span className="text-base-content/65">
                Delete this deck's current cards before importing. Allocated cards are returned to
                their original locations.
              </span>
            </span>
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
        queryClient.invalidateQueries({ queryKey: ["deck-edhrec", deck.id] })
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

function EDHRecDialog({
  activeTab,
  addCardError,
  deck,
  excludeLands,
  isAddingCard,
  onAddCard,
  onExcludeLandsChange,
  onOpenChange,
  onTabChange,
  open,
}: {
  activeTab: EDHRecTab
  addCardError: string | null
  deck: DeckDetail | null
  excludeLands: boolean
  isAddingCard: boolean
  onAddCard: (card: EDHRecCard | EDHRecSectionCard) => void
  onExcludeLandsChange: (excludeLands: boolean) => void
  onOpenChange: (open: boolean) => void
  onTabChange: (tab: EDHRecTab) => void
  open: boolean
}) {
  const edhrecQuery = useQuery({
    queryKey: ["deck-edhrec", deck?.id, excludeLands],
    queryFn: () =>
      request(DeckEdhrecDocument, {
        id: deck?.id || "",
        excludeLands,
      }),
    enabled: open && Boolean(deck?.id),
  })
  const data = edhrecQuery.data?.deckEdhrec
  const tabs = [
    { count: data?.recommendations.length || 0, icon: Sparkles, label: "Recs", value: "recs" },
    { count: data?.cuts.length || 0, icon: XCircle, label: "Cuts", value: "cuts" },
    {
      count: data?.commanderPages.reduce((total, page) => total + page.sections.length, 0) || 0,
      icon: Database,
      label: "Commander",
      value: "commander",
    },
  ] satisfies Array<{
    count: number
    icon: LucideIcon
    label: string
    value: EDHRecTab
  }>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100svh-2rem)] max-w-[96rem] flex-col"
        labelledBy="edhrec-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="edhrec-title">EDHREC</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {deck?.name}
              {data?.commanderNames.length ? ` · ${data.commanderNames.join(" + ")}` : ""}
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.value}
                    type="button"
                    className={cn(
                      "btn btn-sm min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm",
                      activeTab === tab.value ? "btn-primary" : "btn-outline",
                    )}
                    onClick={() => onTabChange(tab.value)}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{tab.label}</span>
                    <span className="badge badge-sm shrink-0">{tab.count}</span>
                  </button>
                )
              })}
            </div>

            <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={excludeLands}
                onChange={(event) => onExcludeLandsChange(event.target.checked)}
              />
              <span className="label-text text-sm">Exclude lands</span>
            </label>
          </div>

          {edhrecQuery.isLoading ? <EmptyState title="Loading EDHREC..." /> : null}

          {edhrecQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {edhrecQuery.error instanceof Error
                ? edhrecQuery.error.message
                : "Could not load EDHREC data"}
            </p>
          ) : null}

          {addCardError ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {addCardError}
            </p>
          ) : null}

          {!edhrecQuery.isLoading && data ? (
            <>
              {activeTab === "recs" ? (
                <EDHRecCardGrid
                  cards={data.recommendations}
                  emptyTitle="No EDHREC recommendations returned"
                  isAddingCard={isAddingCard}
                  mode="recs"
                  onAddCard={onAddCard}
                />
              ) : null}
              {activeTab === "cuts" ? (
                <EDHRecCardGrid
                  cards={data.cuts}
                  emptyTitle="No EDHREC cuts returned"
                  isAddingCard={isAddingCard}
                  mode="cuts"
                  onAddCard={onAddCard}
                />
              ) : null}
              {activeTab === "commander" ? (
                <EDHRecCommanderData
                  deck={deck}
                  isAddingCard={isAddingCard}
                  onAddCard={onAddCard}
                  pages={data.commanderPages}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EDHRecCardGrid({
  cards,
  emptyTitle,
  isAddingCard,
  mode,
  onAddCard,
}: {
  cards: EDHRecCard[]
  emptyTitle: string
  isAddingCard: boolean
  mode: "recs" | "cuts"
  onAddCard: (card: EDHRecCard) => void
}) {
  if (!cards.length) return <EmptyState title={emptyTitle} />

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-5">
        {cards.map((card) => (
          <EDHRecCardTile
            key={`${mode}-${card.oracleId || card.name}`}
            card={card}
            isAddingCard={isAddingCard}
            mode={mode}
            onAddCard={onAddCard}
          />
        ))}
      </div>
    </div>
  )
}

function EDHRecCardTile({
  card,
  isAddingCard,
  mode,
  onAddCard,
}: {
  card: EDHRecCard
  isAddingCard: boolean
  mode: "recs" | "cuts"
  onAddCard: (card: EDHRecCard) => void
}) {
  const imageUrl = edhrecCardImageUrl(card)
  const score = typeof card.score === "number" ? Math.max(0, Math.min(100, card.score)) : null

  return (
    <article className="min-w-0">
      <EDHRecCardLink card={card} className="block">
        <figure className="relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-lg ring-1 ring-base-content/10 transition hover:-translate-y-0.5 hover:shadow-2xl">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-base-content/55">
              {card.name}
            </div>
          )}
          <div className="absolute bottom-2 right-2">
            <CollectionStatusBadge status={card.collectionStatus} />
          </div>
        </figure>
      </EDHRecCardLink>

      <div className="mt-2 space-y-1.5">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <EDHRecCardLink
              card={card}
              className="block truncate text-sm font-black hover:text-primary"
            >
              {card.name}
            </EDHRecCardLink>
            <div className="truncate text-xs text-base-content/60">
              {cardTypeLine(card) || "EDHREC"}
            </div>
          </div>
          <EDHRecCardMenu
            card={card}
            isAddingCard={isAddingCard}
            onAddCard={() => onAddCard(card)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/65">
          <span>{mode === "recs" ? "Score" : "Cut score"}</span>
          <span className="font-mono">{score == null ? "-" : Math.round(score)}</span>
        </div>
        <div className="relative h-4 overflow-hidden rounded bg-primary/15">
          <div
            className="h-full rounded bg-primary/80"
            style={{ width: `${score == null ? 0 : score}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[0.65rem] font-black leading-none text-primary-content mix-blend-screen">
            {score == null ? "-" : Math.round(score)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60">
          <span>{edhrecCardPrice(card) || "No local price"}</span>
          <span>Salt {formatOptionalNumber(card.salt)}</span>
        </div>
      </div>
    </article>
  )
}

function EDHRecCommanderData({
  deck,
  isAddingCard,
  onAddCard,
  pages,
}: {
  deck: DeckDetail | null
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard) => void
  pages: EDHRecCommanderPage[]
}) {
  if (!pages.length) return <EmptyState title="No commander data returned" />

  return (
    <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pr-1">
      {pages.map((page) => (
        <section key={page.name} className="space-y-4">
          <EDHRecCommanderHero deck={deck} page={page} />

          <div className="space-y-5">
            {page.sections.map((section) => (
              <EDHRecSectionPanel
                key={`${page.name}-${section.tag || section.header}`}
                isAddingCard={isAddingCard}
                onAddCard={onAddCard}
                section={section}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EDHRecCommanderHero({
  deck,
  page,
}: {
  deck: DeckDetail | null
  page: EDHRecCommanderPage
}) {
  const commander = commanderDeckCard(deck, page.name)
  const imageUrl = commander ? cardImageUrl(commander, "imageUrl") : null

  return (
    <section className="grid gap-5 rounded-box border border-base-300 bg-base-200/45 p-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-60">
        <figure className="aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-xl ring-1 ring-base-content/10">
          {imageUrl ? (
            <img src={imageUrl} alt={page.name} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-base-content/55">
              {page.name}
            </div>
          )}
        </figure>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-2xl font-black tracking-normal">{page.title}</h3>
            <p className="mt-1 text-sm text-base-content/65">{page.description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={page.url} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              EDHREC
            </a>
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {page.stats.slice(0, 8).map((stat) => (
            <div
              key={`${page.name}-${stat.label}`}
              className="rounded-box border border-base-300 bg-base-100/70 p-3"
            >
              <div className="text-xs font-semibold uppercase text-base-content/55">
                {stat.label}
              </div>
              <div className="mt-1 text-lg font-black">{stat.value}</div>
            </div>
          ))}
        </div>

        {page.themes.length ? (
          <div className="flex flex-wrap gap-2">
            {page.themes.map((theme) => (
              <Badge key={`${page.name}-${theme.slug || theme.name}`} tone="primary">
                {theme.name}
                {theme.count ? ` ${compactNumber(theme.count)}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}

        {page.similar.length ? (
          <div className="text-sm text-base-content/65">
            <span className="font-semibold text-base-content/80">Similar:</span>{" "}
            {page.similar.join(", ")}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function EDHRecSectionPanel({
  isAddingCard,
  onAddCard,
  section,
}: {
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard) => void
  section: EDHRecSection
}) {
  return (
    <details open className="group rounded-box border border-base-300 bg-base-100/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-base-300 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown className="h-4 w-4 shrink-0 text-base-content/55 transition group-open:rotate-180" />
          <h4 className="truncate font-black tracking-normal">{section.header}</h4>
        </span>
        <span className="badge badge-ghost shrink-0">{section.cards.length}</span>
      </summary>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:gap-4">
          {section.cards.map((card) => (
            <EDHRecSectionCardTile
              key={`${section.header}-${card.oracleId || card.name}`}
              card={card}
              isAddingCard={isAddingCard}
              onAddCard={onAddCard}
            />
          ))}
        </div>
      </div>
    </details>
  )
}

function EDHRecSectionCardTile({
  card,
  isAddingCard,
  onAddCard,
}: {
  card: EDHRecSectionCard
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard) => void
}) {
  const imageUrl = edhrecCardImageUrl(card)

  return (
    <article className="min-w-0">
      <EDHRecCardLink card={card} className="block">
        <figure className="relative aspect-[5/7] overflow-hidden rounded-lg bg-base-300 shadow-md ring-1 ring-base-content/10 transition hover:-translate-y-0.5 hover:shadow-xl">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-xs text-base-content/55">
              {card.name}
            </div>
          )}
          <div className="absolute bottom-1.5 right-1.5">
            <CollectionStatusBadge status={card.collectionStatus} compact />
          </div>
        </figure>
      </EDHRecCardLink>
      <div className="mt-2 flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <EDHRecCardLink
            card={card}
            className="block truncate text-sm font-black hover:text-primary"
          >
            {card.name}
          </EDHRecCardLink>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-base-content/60">
            <span>{formatSynergy(card)}</span>
            <span>
              {card.numDecks ? `${compactNumber(card.numDecks)} decks` : edhrecCardPrice(card)}
            </span>
          </div>
        </div>
        <EDHRecCardMenu card={card} isAddingCard={isAddingCard} onAddCard={() => onAddCard(card)} />
      </div>
    </article>
  )
}

function EDHRecCardMenu({
  card,
  isAddingCard,
  onAddCard,
}: {
  card: EDHRecCard | EDHRecSectionCard
  isAddingCard: boolean
  onAddCard: () => void
}) {
  const localCardId = card.card?.oracleId
  const externalUrl = edhrecCardUrl(card)

  return (
    <div
      className="dropdown dropdown-end shrink-0"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-xs border-0 bg-base-200 text-base-content/70 shadow-sm transition hover:bg-base-300"
        tabIndex={0}
        aria-label={`${card.name} actions`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
        onClick={blurFocusedMenuItem}
      >
        <li>
          <button type="button" disabled={isAddingCard} onClick={onAddCard}>
            <Plus className="h-4 w-4" />
            {isAddingCard ? "Adding..." : "Add to deck"}
          </button>
        </li>
        <li>
          {localCardId ? (
            <Link to="/cards/$id" params={{ id: localCardId }}>
              <Eye className="h-4 w-4" />
              View card
            </Link>
          ) : externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              View on EDHREC
            </a>
          ) : (
            <button type="button" disabled>
              <Eye className="h-4 w-4" />
              View card
            </button>
          )}
        </li>
      </ul>
    </div>
  )
}

function EDHRecCardLink({
  card,
  children,
  className,
}: {
  card: EDHRecCard | EDHRecSectionCard
  children: ReactNode
  className?: string
}) {
  const localCardId = card.card?.oracleId
  const externalUrl = edhrecCardUrl(card)

  if (localCardId) {
    return (
      <Link to="/cards/$id" params={{ id: localCardId }} className={className}>
        {children}
      </Link>
    )
  }

  return externalUrl ? (
    <a href={externalUrl} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <>{children}</>
  )
}

function CollectionStatusBadge({
  compact = false,
  status,
}: {
  compact?: boolean
  status: EDHRecCollectionStatus
}) {
  return (
    <Badge
      tone={collectionStatusTone(status.state)}
      className={cn(
        "whitespace-nowrap bg-base-100/90 shadow-sm backdrop-blur",
        compact && "px-1.5 text-[0.62rem]",
      )}
    >
      <AllocationStatusIcon
        state={status.state}
        className={cn("mr-1 h-3 w-3", compact && "h-2.5 w-2.5")}
      />
      {collectionStatusShortLabel(status)}
    </Badge>
  )
}

function collectionStatusShortLabel(status: EDHRecCollectionStatus) {
  if (status.state === "allocated") return "In deck"
  if (status.state === "available") return `${status.available} free`
  if (status.state === "partial") return `${status.owned} owned`
  if (status.state === "basic_land") return "Basic"
  return "Missing"
}

function collectionStatusTone(
  state: string,
): "neutral" | "primary" | "success" | "warning" | "error" {
  if (state === "allocated") return "success"
  if (state === "available" || state === "basic_land") return "primary"
  if (state === "partial") return "warning"
  return "error"
}

function edhrecCardImageUrl(card: EDHRecCard | EDHRecSectionCard) {
  const printing = card.card?.printings?.find(
    (printing) => printing?.imageUrl || printing?.artCropUrl,
  )
  return printing?.imageUrl || printing?.artCropUrl
}

function edhrecCardPrice(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.printings?.find((printing) => printing?.priceText)?.priceText || null
}

function edhrecCardPrintingId(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.printings?.find((printing) => printing?.scryfallId)?.scryfallId || null
}

function edhrecCardUrl(card: EDHRecCard | EDHRecSectionCard) {
  if ("url" in card && card.url) return card.url
  if ("edhrecUrl" in card && card.edhrecUrl) return card.edhrecUrl
  return null
}

function cardTypeLine(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.typeLine || ("primaryType" in card ? card.primaryType : null)
}

function formatSynergy(card: EDHRecSectionCard) {
  if (typeof card.synergy === "number") return `${Math.round(card.synergy * 100)}% synergy`
  if (card.numDecks) return `${compactNumber(card.numDecks)} decks`
  return "-"
}

function commanderDeckCard(deck: DeckDetail | null, name: string) {
  const normalizedName = normalizeDisplayName(name)
  return (deck?.deckCards || [])
    .filter(present)
    .find(
      (deckCard) =>
        deckCard.zone === "commander" &&
        normalizeDisplayName(deckCard.card?.name || "") === normalizedName,
    )
}

function normalizeDisplayName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function formatOptionalNumber(value?: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "-"
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
                onChange={(event) => {
                  setPrintingMode(event.target.value as BuylistPrintingMode)
                  event.currentTarget.blur()
                }}
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
                onChange={(event) => {
                  setExportFormat(event.target.value as BuylistExportFormat)
                  event.currentTarget.blur()
                }}
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
