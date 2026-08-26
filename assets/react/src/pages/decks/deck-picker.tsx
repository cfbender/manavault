import { useMutation, useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { ChevronDown, Dices, History, Layers, RotateCcw } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import type { DeckPlayOutcome, RandomDeckQuery } from "../../gql/graphql"
import { compactNumber, titleize } from "../../lib/utils"
import { DeckNameWithCommanderIdentity } from "./deck-list-model"
import type { DeckSummary } from "./deck-types"
import { RandomDeckDocument, RecordDeckPlayDocument } from "./queries"

type RandomDeck = NonNullable<RandomDeckQuery["randomDeck"]>

export function RandomDeckDialog({
  onOpenChange,
  onRecorded,
  open,
}: {
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
  open: boolean
}) {
  const [mutationError, setMutationError] = useState(false)
  const descriptionId = useId()
  const titleId = useId()
  const { showToast } = useToast()
  const { data, error, loading, refetch } = useQuery(RandomDeckDocument, {
    fetchPolicy: "network-only",
    skip: !open,
    variables: { excludeId: null },
  })
  const [recordDeckPlay, { loading: isRecording }] = useMutation(RecordDeckPlayDocument)
  const deck = data?.randomDeck || null

  useEffect(() => {
    if (open) return
    setMutationError(false)
  }, [open])

  async function record(outcome: DeckPlayOutcome) {
    if (!deck || isRecording) return
    setMutationError(false)

    try {
      await recordDeckPlay({ variables: { id: deck.id, outcome } })
      onRecorded()
    } catch {
      setMutationError(true)
      return
    }

    if (outcome === "SKIPPED") {
      void refetch({ excludeId: deck.id }).catch(() => undefined)
    } else {
      showToast(`${deck.name} marked as played`)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        describedBy={descriptionId}
        labelledBy={titleId}
        role="dialog"
      >
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle id={titleId}>Pick a deck to play</DialogTitle>
            <p id={descriptionId} className="mt-2 max-w-prose text-sm text-base-content/65">
              Suggestions favor decks played less often and less recently. Skipping raises a deck’s
              odds next time.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="flex min-h-72 flex-1 flex-col justify-center p-5" aria-live="polite">
          {loading ? (
            <DeckPickerSkeleton />
          ) : error ? (
            <DeckPickerMessage
              title="A deck could not be picked"
              detail="Close this dialog and try again after the deck gallery reconnects."
            />
          ) : deck ? (
            <DeckCandidate deck={deck} />
          ) : (
            <DeckPickerMessage
              title="No decks are ready to pick"
              detail="Create a deck or move one out of the archive, then try again."
            />
          )}

          {mutationError ? (
            <p className="mt-4 text-sm font-semibold text-error" role="alert">
              That choice could not be saved. Try it again.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-base-300 p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!deck || loading || isRecording}
            onClick={() => void record("SKIPPED")}
          >
            <RotateCcw className="h-4 w-4" />
            {isRecording ? "Saving…" : "Skip"}
          </Button>
          <Button
            type="button"
            disabled={!deck || loading || isRecording}
            onClick={() => void record("PLAYED")}
          >
            <Dices className="h-4 w-4" />
            {isRecording ? "Saving…" : "Play this deck"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeckCandidate({ deck }: { deck: RandomDeck }) {
  return (
    <ImageSummaryCard
      interactive={false}
      imageUrl={deck.coverImageUrl}
      fallback={<Layers className="h-12 w-12" />}
      typeLine={<Badge>{titleize(deck.format)}</Badge>}
      countLine={`${compactNumber(deck.cardCount || 0)} cards`}
      detailLine={`${deck.playCount} ${deck.playCount === 1 ? "play" : "plays"} · ${deck.skipCount} ${deck.skipCount === 1 ? "skip" : "skips"}`}
      nameLine={
        <DeckNameWithCommanderIdentity colors={deck.commanderColorIdentity} name={deck.name} />
      }
    />
  )
}

function DeckPickerSkeleton() {
  return (
    <div
      className="min-h-52 animate-pulse rounded-box border border-base-300 bg-base-200"
      aria-label="Picking a deck"
      role="status"
    />
  )
}

function DeckPickerMessage({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="py-10 text-center">
      <Dices className="mx-auto h-9 w-9 text-base-content/35" />
      <h3 className="mt-4 text-lg font-black tracking-normal">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-base-content/65">{detail}</p>
    </div>
  )
}

export function DeckPlayHistory({ decks }: { decks: DeckSummary[] }) {
  const sortedDecks = useMemo(() => sortDecksByLastPlayed(decks), [decks])
  const totalPlays = useMemo(
    () => decks.reduce((total, deck) => total + deck.playCount, 0),
    [decks],
  )

  if (!decks.length) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-box bg-base-200 text-base-content/70">
            <History className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-black tracking-normal">Play history</span>
            <span className="block text-sm text-base-content/65">
              Plays reduce future odds; skips increase them.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="badge border-transparent bg-base-200 text-sm">
            {totalPlays} {totalPlays === 1 ? "play" : "plays"}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="overflow-x-auto border-t border-base-300">
        <table className="table table-sm min-w-[38rem]">
          <caption className="sr-only">Play and skip history for active decks</caption>
          <thead>
            <tr>
              <th scope="col">Deck</th>
              <th scope="col">Format</th>
              <th scope="col" className="text-right">
                Plays
              </th>
              <th scope="col" className="text-right">
                Skips
              </th>
              <th scope="col">Last played</th>
            </tr>
          </thead>
          <tbody>
            {sortedDecks.map((deck) => (
              <tr key={deck.id}>
                <th scope="row">
                  <Link
                    to="/decks/$id"
                    params={{ id: deck.id }}
                    className="font-black hover:text-primary focus-visible:rounded-field focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {deck.name}
                  </Link>
                </th>
                <td>{titleize(deck.format)}</td>
                <td className="text-right font-mono font-bold tabular-nums">{deck.playCount}</td>
                <td className="text-right font-mono font-bold tabular-nums">{deck.skipCount}</td>
                <td>{formatLastPlayed(deck.lastPlayedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function sortDecksByLastPlayed(decks: DeckSummary[]) {
  return [...decks].sort((left, right) => {
    if (left.lastPlayedAt && right.lastPlayedAt) {
      const byDate = right.lastPlayedAt.localeCompare(left.lastPlayedAt)
      if (byDate !== 0) return byDate
    } else if (left.lastPlayedAt) {
      return -1
    } else if (right.lastPlayedAt) {
      return 1
    }

    return left.name.localeCompare(right.name)
  })
}

function formatLastPlayed(value: string | null) {
  if (!value) return "Never"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
