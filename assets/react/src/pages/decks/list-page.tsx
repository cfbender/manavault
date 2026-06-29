import { useMutation, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Edit3, Layers, Plus, Share2 } from "lucide-react"
import { useMemo, useState } from "react"
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
import { flattenDecks, type DeckSummary } from "./deck-types"
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

function DeckGalleryEmptyState({ onNewDeck }: { onNewDeck: () => void }) {
  return (
    <EmptyState
      title="Start your deck gallery"
      description="Create a deck shell, then import a list or add cards from the catalog when you are ready to connect exact printings."
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
          typeLine={<Badge>{titleize(deck.format)}</Badge>}
          countLine={`${compactNumber(deck.cardCount || 0)} cards`}
          detailLine={<DeckReadinessBadges readiness={readiness} />}
          nameLine={
            <DeckNameWithCommanderIdentity colors={deck.commanderColorIdentity} name={deck.name} />
          }
        />
      </Link>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 bg-base-100/90"
          onClick={onEdit}
        >
          <Edit3 className="h-4 w-4" />
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 bg-base-100/90"
          onClick={onShare}
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>
      <SummaryActionMenu
        label={`${deck.name} actions`}
        onEdit={onEdit}
        onShare={onShare}
        onDelete={onDelete}
      />
    </div>
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
  } = useQuery(DecksDocument, { fetchPolicy: "cache-and-network" })
  const decks = useMemo(() => flattenDecks(data?.decks), [data?.decks])
  const deckGroups = groupDecksByFormat(decks)
  const isInitialLoading = isLoading && !data

  function deleteSelectedDeck() {
    if (!deletingDeck) return
    const deckName = deletingDeck.name
    void deleteDeck({
      variables: { id: deletingDeck.id },
      onCompleted: () => showToast(`Deleted deck ${deckName}`),
    })
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
      ) : deckGroups.length ? (
        <PageSection count={`${decks.length} total`}>
          <div className="space-y-10">
            {deckGroups.map(([format, decks]) => (
              <section key={format} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black tracking-normal">{titleize(format)}</h2>
                  <span className="badge border-transparent bg-base-200 text-sm">
                    {decks.length}
                  </span>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {decks.map((deck) => (
                    <DeckGalleryCard
                      key={deck.id}
                      deck={deck}
                      onEdit={() => setEditingDeck(deck)}
                      onShare={() => setSharingDeck(deck)}
                      onDelete={() => setDeletingDeck(deck)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </PageSection>
      ) : (
        <DeckGalleryEmptyState onNewDeck={() => setIsNewDeckOpen(true)} />
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
