import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Layers, Plus } from "lucide-react"
import { useState } from "react"
import { PageHeader, PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { request } from "../../lib/graphql"
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
import type { DeckSummary } from "./deck-types"
import { DecksDocument, DeleteDeckDocument } from "./queries"

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
                            <div className="flex flex-wrap items-center gap-2 leading-none">
                              <Badge tone={deck.status === "active" ? "success" : "neutral"}>
                                {titleize(deck.status)}
                              </Badge>
                              <span className="inline-flex h-5 items-center">
                                {compactNumber(deck.uniqueCardCount || 0)} unique
                              </span>
                              <Badge tone={deckLegalityTone(deck.legality)}>
                                {deckLegalityLabel(deck.legality)}
                              </Badge>
                              {deck.legality?.status === "legal" ? null : (
                                <span className="inline-flex h-5 items-center">
                                  {deckLegalityIssueCountLabel(
                                    deckLegalityIssueCount(deck.legality),
                                  )}
                                </span>
                              )}
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
