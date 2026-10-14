import { useMutation, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Archive, ChevronDown, Dices, Plus, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { useToast } from "../../components/ui/toast"
import { compactNumber, titleize } from "../../lib/utils"
import { SummaryActionMenu } from "./deck-actions"
import { DeckAnalysisDialog } from "./deck-analysis-dialog"
import { DeckBox } from "./deck-box"
import { DeckBracketBadge } from "./deck-bracket"
import { DeckCombosDialog } from "./deck-combos-dialog"
import { EditDeckDialog, NewDeckDialog } from "./deck-editor-dialogs"
import {
  deckLegalityIssueCount,
  deckLegalityIssueCountLabel,
  deckLegalityLabel,
  deckLegalityTone,
} from "./deck-legality"
import { groupDecksByFormat } from "./deck-list-model"
import { DeckPlayHistory, RandomDeckDialog } from "./deck-picker"
import { ShareDeckDialog } from "./deck-share-dialogs"
import { flattenDecks, partitionDecksByArchive, type DeckSummary } from "./deck-types"
import { DecksDocument, DeleteDeckDocument } from "./deck-list-documents"

function DeckGalleryHeader({
  canPickDeck,
  onAnalyzeDeck,
  onNewDeck,
  onPickDeck,
}: {
  canPickDeck: boolean
  onAnalyzeDeck: () => void
  onNewDeck: () => void
  onPickDeck: () => void
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-base-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-4xl font-black tracking-normal">Decks</h1>
        <p className="mt-3 max-w-3xl text-base text-base-content/70">
          Browse your deck gallery, then open a list to tune exact printings and card allocations.
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
        <Button
          type="button"
          variant="outline"
          className="min-w-36 flex-1 sm:flex-none"
          onClick={onAnalyzeDeck}
        >
          <Sparkles className="h-4 w-4" />
          Analyze list
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-w-36 flex-1 sm:flex-none"
          disabled={!canPickDeck}
          onClick={onPickDeck}
        >
          <Dices className="h-4 w-4" />
          Pick a deck
        </Button>
        <Button type="button" className="min-w-36 flex-1 sm:flex-none" onClick={onNewDeck}>
          <Plus className="h-4 w-4" />
          New deck
        </Button>
      </div>
    </header>
  )
}

function DeckGallerySkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">Loading deck gallery</span>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <div className="flex aspect-[3/2] w-full items-end justify-center px-[7%] pb-6 pt-[12%]">
            <div className="skeleton h-full w-full rounded-lg" />
          </div>
          <div className="skeleton h-5 w-1/2 rounded" />
          <div className="skeleton h-3 w-1/4 rounded" />
        </div>
      ))}
    </div>
  )
}

function DeckGalleryEmptyState({
  hasArchivedDecks = false,
  onNewDeck,
}: {
  hasArchivedDecks?: boolean
  onNewDeck: () => void
}) {
  return (
    <EmptyState
      title={hasArchivedDecks ? "No active decks" : "Start your deck gallery"}
      description={
        hasArchivedDecks
          ? "Archived decklists stay below for reference without reserving collection cards. Create a new deck when you are ready to build again."
          : "Create a deck shell, then import a list or add cards from the catalog when you are ready to connect exact printings."
      }
      action={
        <Button type="button" onClick={onNewDeck}>
          <Plus className="h-4 w-4" />
          New deck
        </Button>
      }
    />
  )
}

function DeckGalleryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Decks could not load"
      description="The deck gallery is still here; retry the local catalog request before changing deck data."
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry decks
        </Button>
      }
    />
  )
}

type DeckReadiness = {
  label: string
  tone: "neutral" | "primary" | "success" | "warning" | "error"
  detail: string
  detailTone: "neutral" | "primary" | "success" | "warning" | "error"
}

function deckReadiness(deck: DeckSummary): DeckReadiness {
  const issueCount = deckLegalityIssueCount(deck.legality)

  if (deck.legality?.status !== "legal") {
    return {
      label: "Needs review",
      tone: "error",
      detail: deckLegalityIssueCountLabel(issueCount),
      detailTone: "error",
    }
  }

  return {
    label: titleize(deck.status),
    tone: deck.status === "active" ? "success" : deck.status === "brewing" ? "warning" : "neutral",
    detail: deckLegalityLabel(deck.legality),
    detailTone: deckLegalityTone(deck.legality),
  }
}

/** A deck on the gallery shelf: its deck box, name, size, and readiness. */
function DeckGalleryCard({
  deck,
  onCombos,
  onDelete,
  onEdit,
  onShare,
}: {
  deck: DeckSummary
  onCombos: () => void
  onDelete: () => void
  onEdit: () => void
  onShare: () => void
}) {
  const readiness = deckReadiness(deck)

  return (
    <li className="group/tile relative min-w-0">
      <Link
        to="/decks/$id"
        params={{ id: deck.id }}
        className="location-card location-card--interactive block rounded-box focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        viewTransition
      >
        <DeckBox deck={deck} className="w-full" />
        <div className="-mt-1 min-w-0 px-1 text-center">
          <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-normal sm:text-2xl">
            {deck.name}
          </h3>
          <div className="mt-1 truncate font-mono text-xs font-bold text-base-content/65 sm:text-sm">
            {compactNumber(deck.cardCount || 0)} cards
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 leading-none">
            {readiness.tone === "error" || readiness.tone === "warning" ? (
              <Badge tone={readiness.tone}>{readiness.label}</Badge>
            ) : null}
            <DeckBracketBadge deck={deck} />
          </div>
        </div>
      </Link>
      <SummaryActionMenu
        className="right-0 top-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/tile:opacity-100 [@media(hover:hover)]:group-focus-within/tile:opacity-100"
        label={`${deck.name} actions`}
        onCombos={onCombos}
        onEdit={onEdit}
        onShare={onShare}
        onDelete={onDelete}
      />
    </li>
  )
}

function DeckFormatSections({
  countSuffix,
  deckGroups,
  onCombos,
  onDelete,
  onEdit,
  onShare,
}: {
  countSuffix?: string
  deckGroups: ReturnType<typeof groupDecksByFormat>
  onCombos: (deck: DeckSummary) => void
  onDelete: (deck: DeckSummary) => void
  onEdit: (deck: DeckSummary) => void
  onShare: (deck: DeckSummary) => void
}) {
  return (
    <div className="space-y-10">
      {deckGroups.map(([format, decks]) => (
        <section key={format} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black tracking-normal">{titleize(format)}</h2>
            <span className="badge border-transparent bg-base-200 text-sm">
              {decks.length}
              {countSuffix ? ` ${countSuffix}` : ""}
            </span>
          </div>
          <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {decks.map((deck) => (
              <DeckGalleryCard
                key={deck.id}
                deck={deck}
                onCombos={() => onCombos(deck)}
                onEdit={() => onEdit(deck)}
                onShare={() => onShare(deck)}
                onDelete={() => onDelete(deck)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ArchivedDecksAccordion({
  deckCount,
  deckGroups,
  onCombos,
  onDelete,
  onEdit,
  onShare,
}: {
  deckCount: number
  deckGroups: ReturnType<typeof groupDecksByFormat>
  onCombos: (deck: DeckSummary) => void
  onDelete: (deck: DeckSummary) => void
  onEdit: (deck: DeckSummary) => void
  onShare: (deck: DeckSummary) => void
}) {
  if (deckCount === 0) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-box bg-base-200 text-base-content/70">
            <Archive className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-black tracking-normal">Archived decks</span>
            <span className="block text-sm text-base-content/65">
              Retired decklists stay viewable without reserving collection cards.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="badge border-transparent bg-base-200 text-sm">{deckCount}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-base-300 p-4">
        <DeckFormatSections
          deckGroups={deckGroups}
          onCombos={onCombos}
          onEdit={onEdit}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
    </details>
  )
}

export function DecksPage() {
  const [isDeckAnalysisOpen, setIsDeckAnalysisOpen] = useState(false)
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
  const [isRandomDeckOpen, setIsRandomDeckOpen] = useState(false)
  const [comboDeck, setComboDeck] = useState<DeckSummary | null>(null)
  const [editingDeck, setEditingDeck] = useState<DeckSummary | null>(null)
  const [sharingDeck, setSharingDeck] = useState<DeckSummary | null>(null)
  const [deletingDeck, setDeletingDeck] = useState<DeckSummary | null>(null)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [deleteDeck] = useMutation(DeleteDeckDocument, {
    refetchQueries: [{ query: DecksDocument }],
  })
  const {
    data,
    error: decksError,
    loading: isLoading,
    refetch,
    fetchMore: fetchMoreDecks,
  } = useQuery(DecksDocument, { fetchPolicy: "cache-and-network" })

  // The Decks query caps at first: 100 and selected pageInfo but never paginated,
  // so a user with more than 100 decks silently saw only the first page. Walk
  // fetchMore until every page is loaded (users with <=100 decks report
  // hasNextPage=false on page one, so this never runs for them).
  const decksPageInfo = data?.decks?.pageInfo
  const isLoadingMoreDecks = useRef(false)
  useEffect(() => {
    if (!decksPageInfo?.hasNextPage || !decksPageInfo.endCursor) return
    if (isLoadingMoreDecks.current) return

    isLoadingMoreDecks.current = true
    void fetchMoreDecks({
      variables: { after: decksPageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => {
        const nextConnection = fetchMoreResult?.decks
        if (!nextConnection || !previous?.decks) return fetchMoreResult ?? previous

        return {
          ...previous,
          decks: {
            ...nextConnection,
            edges: [...(previous.decks.edges || []), ...(nextConnection.edges || [])],
          },
        }
      },
    }).finally(() => {
      isLoadingMoreDecks.current = false
    })
  }, [decksPageInfo?.hasNextPage, decksPageInfo?.endCursor, fetchMoreDecks])

  const decks = useMemo(() => flattenDecks(data?.decks), [data?.decks])
  const { activeDecks, archivedDecks } = useMemo(() => partitionDecksByArchive(decks), [decks])
  const deckGroups = useMemo(() => groupDecksByFormat(activeDecks), [activeDecks])
  const archivedDeckGroups = useMemo(() => groupDecksByFormat(archivedDecks), [archivedDecks])
  const isInitialLoading = isLoading && !data

  function deleteSelectedDeck() {
    if (!deletingDeck) return
    const deckName = deletingDeck.name
    void deleteDeck({
      variables: { id: deletingDeck.id },
      onCompleted: () => showToast(`Deleted deck ${deckName}`),
      onError: () => showToast(`Could not delete deck ${deckName}`, { tone: "error" }),
    }).catch(() => undefined)
    if (editingDeck?.id === deletingDeck.id) setEditingDeck(null)
    if (sharingDeck?.id === deletingDeck.id) setSharingDeck(null)
    navigate({ to: "/decks" })
  }
  return (
    <>
      <DeckGalleryHeader
        canPickDeck={activeDecks.length > 0}
        onAnalyzeDeck={() => setIsDeckAnalysisOpen(true)}
        onNewDeck={() => setIsNewDeckOpen(true)}
        onPickDeck={() => setIsRandomDeckOpen(true)}
      />
      {decksError && !data ? (
        <DeckGalleryErrorState onRetry={() => void refetch()} />
      ) : isInitialLoading ? (
        <DeckGallerySkeleton />
      ) : (
        <div className="space-y-8">
          {deckGroups.length ? (
            <DeckFormatSections
              countSuffix="active"
              deckGroups={deckGroups}
              onCombos={setComboDeck}
              onEdit={setEditingDeck}
              onShare={setSharingDeck}
              onDelete={setDeletingDeck}
            />
          ) : (
            <DeckGalleryEmptyState
              hasArchivedDecks={archivedDecks.length > 0}
              onNewDeck={() => setIsNewDeckOpen(true)}
            />
          )}
          <DeckPlayHistory decks={activeDecks} />
          <ArchivedDecksAccordion
            deckCount={archivedDecks.length}
            deckGroups={archivedDeckGroups}
            onCombos={setComboDeck}
            onEdit={setEditingDeck}
            onShare={setSharingDeck}
            onDelete={setDeletingDeck}
          />
        </div>
      )}
      <DeckAnalysisDialog open={isDeckAnalysisOpen} onOpenChange={setIsDeckAnalysisOpen} />
      <NewDeckDialog open={isNewDeckOpen} onOpenChange={setIsNewDeckOpen} />
      <RandomDeckDialog
        open={isRandomDeckOpen}
        onOpenChange={setIsRandomDeckOpen}
        onRecorded={() => void refetch()}
      />
      <DeckCombosDialog
        deck={comboDeck}
        open={Boolean(comboDeck)}
        onOpenChange={(open) => !open && setComboDeck(null)}
      />
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
