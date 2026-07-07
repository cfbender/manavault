import { useMutation, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Archive, ChevronDown, Layers, Plus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { useToast } from "../../components/ui/toast"
import { compactNumber, titleize } from "../../lib/utils"
import { SummaryActionMenu } from "./deck-actions"
import { EditDeckDialog, NewDeckDialog } from "./deck-editor-dialogs"
import {
  deckLegalityIssueCount,
  deckLegalityIssueCountLabel,
  deckLegalityLabel,
  deckLegalityTone,
} from "./deck-legality"
import { DeckNameWithCommanderIdentity, groupDecksByFormat } from "./deck-list-model"
import { ShareDeckDialog } from "./deck-share-dialogs"
import { flattenDecks, partitionDecksByArchive, type DeckSummary } from "./deck-types"
import { DecksDocument, DeleteDeckDocument } from "./queries"

function DeckGalleryHeader({ onNewDeck }: { onNewDeck: () => void }) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-base-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-4xl font-black tracking-normal">Decks</h1>
        <p className="mt-3 max-w-3xl text-base text-base-content/70">
          Browse your deck gallery, then open a list to tune exact printings and card allocations.
        </p>
      </div>
      <Button type="button" className="w-full sm:w-auto" onClick={onNewDeck}>
        <Plus className="h-4 w-4" />
        New deck
      </Button>
    </header>
  )
}

function DeckGallerySkeleton() {
  return (
    <PageSection count="Loading decks">
      <div className="space-y-10" aria-busy="true" aria-label="Loading deck gallery" role="status">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="h-7 w-32 animate-pulse rounded bg-base-200" />
            <div className="h-6 w-10 animate-pulse rounded-full bg-base-200" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="min-h-52 rounded-box border border-base-300 bg-base-100 p-5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-5 w-20 animate-pulse rounded bg-base-200" />
                  <div className="h-5 w-16 animate-pulse rounded bg-base-200" />
                </div>
                <div className="mt-20 h-8 w-3/4 animate-pulse rounded bg-base-200" />
                <div className="mt-4 flex gap-2">
                  <div className="h-5 w-16 animate-pulse rounded bg-base-200" />
                  <div className="h-5 w-14 animate-pulse rounded bg-base-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageSection>
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

function DeckReadinessBadges({ readiness }: { readiness: DeckReadiness }) {
  return (
    <div className="flex flex-wrap items-center gap-2 leading-none">
      <Badge tone={readiness.tone}>{readiness.label}</Badge>
      <Badge tone={readiness.detailTone}>{readiness.detail}</Badge>
    </div>
  )
}

function DeckGalleryCard({
  deck,
  onDelete,
  onEdit,
  onShare,
}: {
  deck: DeckSummary
  onDelete: () => void
  onEdit: () => void
  onShare: () => void
}) {
  const readiness = deckReadiness(deck)

  return (
    <div className="relative">
      <Link to="/decks/$id" params={{ id: deck.id }} className="block">
        <ImageSummaryCard
          imageUrl={deck.coverImageUrl}
          fallback={<Layers className="h-12 w-12" />}
          typeLine={
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{titleize(deck.format)}</Badge>
              {deck.status === "archived" ? <Badge>Archived</Badge> : null}
            </div>
          }
          countLine={`${compactNumber(deck.cardCount || 0)} cards`}
          detailLine={<DeckReadinessBadges readiness={readiness} />}
          nameLine={
            <DeckNameWithCommanderIdentity colors={deck.commanderColorIdentity} name={deck.name} />
          }
        />
      </Link>
      <SummaryActionMenu
        label={`${deck.name} actions`}
        onEdit={onEdit}
        onShare={onShare}
        onDelete={onDelete}
      />
    </div>
  )
}

function DeckFormatSections({
  deckGroups,
  onDelete,
  onEdit,
  onShare,
}: {
  deckGroups: ReturnType<typeof groupDecksByFormat>
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
            <span className="badge border-transparent bg-base-200 text-sm">{decks.length}</span>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {decks.map((deck) => (
              <DeckGalleryCard
                key={deck.id}
                deck={deck}
                onEdit={() => onEdit(deck)}
                onShare={() => onShare(deck)}
                onDelete={() => onDelete(deck)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ArchivedDecksAccordion({
  deckCount,
  deckGroups,
  onDelete,
  onEdit,
  onShare,
}: {
  deckCount: number
  deckGroups: ReturnType<typeof groupDecksByFormat>
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
          onEdit={onEdit}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
    </details>
  )
}

export function DecksPage() {
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
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
      onError: () => showToast(`Could not delete deck ${deckName}`, { tone: "info" }),
    }).catch(() => undefined)
    if (editingDeck?.id === deletingDeck.id) setEditingDeck(null)
    if (sharingDeck?.id === deletingDeck.id) setSharingDeck(null)
    navigate({ to: "/decks" })
  }
  return (
    <>
      <DeckGalleryHeader onNewDeck={() => setIsNewDeckOpen(true)} />
      {decksError && !data ? (
        <DeckGalleryErrorState onRetry={() => void refetch()} />
      ) : isInitialLoading ? (
        <DeckGallerySkeleton />
      ) : (
        <div className="space-y-8">
          {deckGroups.length ? (
            <PageSection count={`${activeDecks.length} active`}>
              <DeckFormatSections
                deckGroups={deckGroups}
                onEdit={setEditingDeck}
                onShare={setSharingDeck}
                onDelete={setDeletingDeck}
              />
            </PageSection>
          ) : (
            <DeckGalleryEmptyState
              hasArchivedDecks={archivedDecks.length > 0}
              onNewDeck={() => setIsNewDeckOpen(true)}
            />
          )}
          <ArchivedDecksAccordion
            deckCount={archivedDecks.length}
            deckGroups={archivedDeckGroups}
            onEdit={setEditingDeck}
            onShare={setSharingDeck}
            onDelete={setDeletingDeck}
          />
        </div>
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
