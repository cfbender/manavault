import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Layers, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import type { DecksQuery } from "../gql/graphql"
import { request } from "../lib/graphql"
import { compactNumber, present, titleize } from "../lib/utils"

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
        preferredPrinting { imageUrl artCropUrl }
        card { printings { imageUrl artCropUrl } }
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
        preferredPrinting { imageUrl artCropUrl }
        card { printings { imageUrl artCropUrl } }
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
        card { oracleId name typeLine printings { imageUrl } }
        preferredPrinting { imageUrl setCode collectorNumber }
      }
    }
  }
`)

export function DecksPage() {
  const [isNewDeckOpen, setIsNewDeckOpen] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ["decks"], queryFn: () => request(DecksDocument) })
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
                  <span className="badge border-transparent bg-base-200 text-sm">{decks.length}</span>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {decks.map(deck => (
                    <Link key={deck.id} to="/decks/$id" params={{ id: deck.id }} className="block">
                      <ImageSummaryCard
                        imageUrl={deckCoverUrl(deck)}
                        fallback={<Layers className="h-12 w-12" />}
                        typeLine={<Badge>{titleize(deck.format)}</Badge>}
                        countLine={`${compactNumber(deck.cardCount || 0)} cards`}
                        detailLine={
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={deck.status === "active" ? "success" : "neutral"}>{titleize(deck.status)}</Badge>
                            <span>{compactNumber(deck.uniqueCardCount || 0)} unique</span>
                          </div>
                        }
                        nameLine={deck.name}
                      />
                    </Link>
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
    </>
  )
}

export function DeckDetailPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["deck", id], queryFn: () => request(DeckDocument, { id }) })
  const deck = data?.deck

  if (isLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

  return (
    <>
      <PageHeader
        title={deck.name}
        description={`${titleize(deck.format)} · ${deck.cardCount || 0} cards · ${deck.uniqueCardCount || 0} unique`}
        actions={<Button asChild variant="outline"><Link to="/decks">Back to decks</Link></Button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(deck.deckCards || []).filter(present).map(deckCard => {
          const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
          return (
            <Card key={deckCard.id}>
              <div className="grid grid-cols-[5rem_1fr] gap-3 p-3">
                <CardImage printing={{ ...printing, card: deckCard.card }} className="w-20" />
                <div className="min-w-0 space-y-2">
                  <Link to="/cards/$id" params={{ id: deckCard.card?.oracleId || "" }} className="font-semibold hover:text-primary">
                    {deckCard.card?.name}
                  </Link>
                  <p className="line-clamp-2 text-sm text-base-content/70">{deckCard.card?.typeLine}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="primary">x{deckCard.quantity}</Badge>
                    <Badge>{titleize(deckCard.zone)}</Badge>
                    <Badge>{titleize(deckCard.finish)}</Badge>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

type DeckSummary = DecksQuery["decks"][number]

const DECK_FORMATS = ["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "limited", "casual"] as const
const DECK_STATUSES = ["brewing", "active", "archived"] as const

function groupDecksByFormat(decks: DeckSummary[]) {
  const grouped = new Map<string, DeckSummary[]>()
  for (const deck of decks) {
    const group = grouped.get(deck.format) || []
    group.push(deck)
    grouped.set(deck.format, group)
  }

  return [...grouped.entries()].sort(([left], [right]) => formatSortValue(left) - formatSortValue(right) || left.localeCompare(right))
}

function formatSortValue(format: string) {
  const index = DECK_FORMATS.indexOf(format as (typeof DECK_FORMATS)[number])
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function deckCoverUrl(deck: DeckSummary) {
  const cover = deck.deckCards?.find(card => card?.preferredPrinting?.artCropUrl || card?.preferredPrinting?.imageUrl || card?.card?.printings?.[0]?.artCropUrl || card?.card?.printings?.[0]?.imageUrl)
  return cover?.preferredPrinting?.artCropUrl || cover?.preferredPrinting?.imageUrl || cover?.card?.printings?.[0]?.artCropUrl || cover?.card?.printings?.[0]?.imageUrl
}

function NewDeckDialog({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  const createDeck = useMutation({
    mutationFn: () => request(CreateDeckDocument, { input: { name: name.trim(), format, status } }),
    onSuccess: data => {
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
    onError: error => setError(error instanceof Error ? error.message : "Could not create deck"),
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
    <Dialog open={open} onOpenChange={nextOpen => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="new-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="new-deck-title">New deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">Start with a shell, then import or add cards from the catalog.</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="Deck name" autoFocus />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Format</span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={event => setFormat(event.target.value as (typeof DECK_FORMATS)[number])}
              >
                {DECK_FORMATS.map(format => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Status</span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={event => setStatus(event.target.value as (typeof DECK_STATUSES)[number])}
              >
                {DECK_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {titleize(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}

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
