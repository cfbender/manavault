import { useMutation, useQuery } from "@apollo/client/react"
import {
  ChevronDown,
  ExternalLink,
  History,
  Link as LinkIcon,
  LoaderCircle,
  Sparkles,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import type { DeckAnalysisRequestsQuery } from "../../gql/graphql"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { cn, titleize } from "../../lib/utils"
import { formatDate } from "../settings/data"
import { DeckMarkdown } from "./deck-primer"
import { DECK_FORMATS } from "./deck-types"
import { AnalyzeDeckListDocument, DeckAnalysisRequestsDocument } from "./queries"

type SourceMode = "url" | "text"
type AnalysisRequest = DeckAnalysisRequestsQuery["deckAnalysisRequests"][number]

export function DeckAnalysisDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [mode, setMode] = useState<SourceMode>("url")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [requests, setRequests] = useState<AnalysisRequest[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const requestsQuery = useQuery(DeckAnalysisRequestsDocument, {
    fetchPolicy: "network-only",
    skip: !open,
  })
  const [analyzeDeckList, analysisMutation] = useMutation(AnalyzeDeckListDocument)

  useEffect(() => {
    if (requestsQuery.data) setRequests(requestsQuery.data.deckAnalysisRequests)
  }, [requestsQuery.data])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const source = mode === "url" ? url.trim() : text.trim()

    if (!source) {
      setFormError(
        mode === "url" ? "Paste a deck link to analyze." : "Paste a decklist to analyze.",
      )
      return
    }

    setFormError(null)
    void analyzeDeckList({
      variables: {
        format,
        url: mode === "url" ? source : undefined,
        text: mode === "text" ? source : undefined,
      },
      onCompleted: (data) => {
        const request = data.analyzeDeckList?.deckAnalysisRequest

        if (!request) {
          setFormError("The decklist could not be analyzed. Try again.")
          return
        }

        setRequests((current) => [request, ...current.filter(({ id }) => id !== request.id)])
        if (mode === "url") setUrl("")
        if (mode === "text") setText("")
      },
      onError: (error) => setFormError(error.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl"
        labelledBy="deck-list-analysis-title"
        describedBy="deck-list-analysis-description"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="deck-list-analysis-title">Analyze a deck list</DialogTitle>
            <p id="deck-list-analysis-description" className="mt-1 text-sm text-base-content/60">
              Get a one-time AI read without adding the deck to your vault.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div
                className="inline-flex h-12 w-fit items-center gap-0.5 rounded-full border border-base-300 bg-base-100/60 p-0.5 sm:h-10"
                aria-label="Decklist source"
                role="group"
              >
                {(["url", "text"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => {
                      setMode(option)
                      setFormError(null)
                    }}
                    className={cn(
                      "h-11 rounded-full px-3 text-xs font-bold transition-colors sm:h-9",
                      mode === option
                        ? "bg-primary text-primary-content"
                        : "text-base-content/70 hover:text-base-content",
                    )}
                  >
                    {option === "url" ? "Deck link" : "Paste list"}
                  </button>
                ))}
              </div>

              <label className="block w-full space-y-2 sm:w-52" htmlFor="deck-list-analysis-format">
                <span className="block text-sm font-bold text-base-content">Deck format</span>
                <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
                  <SelectTrigger id="deck-list-analysis-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECK_FORMATS.map((deckFormat) => (
                      <SelectItem key={deckFormat} value={deckFormat}>
                        {titleize(deckFormat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {mode === "url" ? (
              <label className="block space-y-2" htmlFor="deck-list-analysis-url">
                <span className="block text-sm font-bold text-base-content">Deck link</span>
                <Input
                  id="deck-list-analysis-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://moxfield.com/decks/... or https://archidekt.com/decks/..."
                  autoFocus
                  disabled={analysisMutation.loading}
                />
                <span className="block max-w-[72ch] text-xs text-base-content/60">
                  Supports Moxfield, Archidekt, and ManaVault deck share links. For ManaBox, paste
                  its text export instead.
                </span>
              </label>
            ) : (
              <label className="block space-y-2" htmlFor="deck-list-analysis-text">
                <span className="block text-sm font-bold text-base-content">Decklist text</span>
                <Textarea
                  id="deck-list-analysis-text"
                  className="min-h-48 resize-y bg-base-100 font-mono text-sm"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    "Commander\n1 Atraxa, Praetors' Voice\n\nMainboard\n1 Sol Ring\n1 Arcane Signet"
                  }
                  autoFocus
                  disabled={analysisMutation.loading}
                  maxLength={200_000}
                />
                <span className="block max-w-[72ch] text-xs text-base-content/60">
                  Use Commander and Mainboard headings when zones matter. The selected format sets
                  legality and Commander bracket rules.
                </span>
              </label>
            )}

            {formError ? (
              <p
                className="rounded-box border border-error/40 bg-error/10 px-3 py-2 text-sm font-medium text-base-content"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={analysisMutation.loading || !(mode === "url" ? url.trim() : text.trim())}
              >
                {analysisMutation.loading ? (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {analysisMutation.loading ? "Analyzing…" : "Analyze decklist"}
              </Button>
            </div>
          </form>

          <AnalysisHistory
            error={requestsQuery.error?.message}
            loading={requestsQuery.loading && !requestsQuery.data}
            requests={requests}
            onRetry={() => void requestsQuery.refetch()}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AnalysisHistory({
  error,
  loading,
  onRetry,
  requests,
}: {
  error?: string
  loading: boolean
  onRetry: () => void
  requests: AnalysisRequest[]
}) {
  return (
    <section
      className="border-t border-base-300 pt-5"
      aria-labelledby="deck-analysis-history-title"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="deck-analysis-history-title" className="flex items-center gap-2 text-lg font-black">
          <History className="h-5 w-5 text-warning" aria-hidden="true" />
          Saved analyses
        </h3>
        {requests.length ? (
          <span className="text-xs font-bold text-base-content/55">{requests.length} saved</span>
        ) : null}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-base-content/65" role="status">
          <LoaderCircle
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Loading saved analyses…
        </p>
      ) : error ? (
        <div className="rounded-box border border-error/30 bg-error/10 px-4 py-3 text-sm">
          <p className="font-medium text-base-content">{error}</p>
          <Button className="mt-3" size="sm" type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : requests.length ? (
        <div className="space-y-2" aria-live="polite">
          {requests.map((request, index) => (
            <AnalysisHistoryItem key={request.id} open={index === 0} request={request} />
          ))}
        </div>
      ) : (
        <p className="rounded-box border border-dashed border-base-300 px-4 py-4 text-sm text-base-content/60">
          No saved analyses yet. Run one above to start your history.
        </p>
      )}
    </section>
  )
}

function AnalysisHistoryItem({ open, request }: { open: boolean; request: AnalysisRequest }) {
  const bracket = bracketLabel(request)

  return (
    <details className="group rounded-box border border-base-300 bg-base-100" open={open}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold leading-snug">{request.sourceName}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{titleize(request.format)}</Badge>
            <Badge tone="neutral">
              {request.sourceType === "url" ? "Deck link" : "Pasted list"}
            </Badge>
            {bracket ? <Badge tone="primary">{bracket}</Badge> : null}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-base-content/55 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-base-300 px-4 py-4 sm:px-5">
        {request.sourceType === "url" ? (
          <a
            className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
            href={request.source}
            rel="noreferrer"
            target="_blank"
          >
            <LinkIcon className="h-4 w-4" aria-hidden="true" />
            Open source decklist
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
        <DeckMarkdown cardReferences>{request.analysis}</DeckMarkdown>
        <p className="mt-6 break-words text-xs text-base-content/60">
          {request.model} · Analyzed{" "}
          <time dateTime={request.insertedAt}>{formatDate(request.insertedAt)}</time>
        </p>
      </div>
    </details>
  )
}

function bracketLabel(request: AnalysisRequest) {
  if (!request.commanderBracket) return null
  if (
    request.commanderBracketEstimate &&
    request.commanderBracketEstimate !== request.commanderBracket
  ) {
    return `Bracket ${request.commanderBracket} · plays like ${request.commanderBracketEstimate}`
  }
  return `Bracket ${request.commanderBracket}`
}
