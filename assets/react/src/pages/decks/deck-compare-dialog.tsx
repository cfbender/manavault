import { useLazyQuery } from "@apollo/client/react"
import { Clipboard, Search } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import type { DeckDiffQuery } from "../../gql/graphql"
import { cn, pluralize } from "../../lib/utils"
import { DeckDiffDocument } from "./deck-compare-documents"

type SourceMode = "url" | "paste"
type DeckDiffResult = NonNullable<DeckDiffQuery["deckDiff"]>

export function DeckCompareDialog({
  deckId,
  deckName,
  onOpenChange,
  open,
}: {
  deckId: string
  deckName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<SourceMode>("url")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [runDeckDiff, diffQuery] = useLazyQuery(DeckDiffDocument, {
    fetchPolicy: "network-only",
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedUrl = url.trim()
    const trimmedText = text.trim()

    if (mode === "url" && !trimmedUrl) {
      setFormError("Paste a deck or share link to compare")
      return
    }
    if (mode === "paste" && !trimmedText) {
      setFormError("Paste a decklist to compare")
      return
    }

    setFormError(null)
    void runDeckDiff({
      variables: {
        deckId,
        url: mode === "url" ? trimmedUrl : undefined,
        text: mode === "paste" ? trimmedText : undefined,
      },
    })
  }

  async function copyDiff(result: DeckDiffResult) {
    try {
      await navigator.clipboard.writeText(deckDiffAsText(result))
      showToast("Diff copied")
    } catch {
      showToast("Could not copy diff")
    }
  }

  const result = diffQuery.data?.deckDiff ?? null
  const errorMessage = diffQuery.error
    ? diffQuery.error instanceof Error
      ? diffQuery.error.message
      : "Could not compare decks"
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-3rem)] max-w-3xl flex-col"
        labelledBy="deck-compare-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="deck-compare-title">Compare decklist</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckName}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-base-300 bg-base-100/60 p-0.5">
              {(["url", "paste"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-bold transition-colors",
                    mode === option
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:text-base-content",
                  )}
                >
                  {option === "url" ? "Deck link" : "Paste list"}
                </button>
              ))}
            </div>

            {mode === "url" ? (
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Other decklist link
                </span>
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://moxfield.com/decks/... or https://archidekt.com/decks/..."
                  autoFocus
                />
                <span className="block text-xs text-base-content/60">
                  Supports Moxfield, Archidekt, and this instance's /share/decks links. ManaBox has
                  no URL export — switch to Paste list and drop in its text export instead.
                </span>
              </label>
            ) : (
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Other decklist text
                </span>
                <textarea
                  className="textarea textarea-bordered min-h-40 w-full bg-base-100 font-mono text-sm"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={"1x Jund Charm (C13) 195\n2x Lightning Bolt (M11) 146 *F*"}
                  autoFocus
                />
                <span className="block text-xs text-base-content/60">
                  Paste a ManaBox export or any standard decklist text.
                </span>
              </label>
            )}

            {formError ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {formError}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={diffQuery.loading}>
                <Search className="h-4 w-4" />
                {diffQuery.loading ? "Comparing..." : "Compare"}
              </Button>
            </div>
          </form>

          {errorMessage ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {errorMessage}
            </p>
          ) : null}

          {result ? <DeckDiffSummary result={result} onCopy={() => copyDiff(result)} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeckDiffSummary({ result, onCopy }: { result: DeckDiffResult; onCopy: () => void }) {
  const hasChanges = result.adds.length || result.cuts.length || result.changes.length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-200/60 p-3 text-sm">
        <span className="font-bold text-base-content">{result.sourceName || "Pasted list"}</span>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Clipboard className="h-4 w-4" />
          Copy as text
        </Button>
      </div>

      {!hasChanges ? (
        <p className="rounded-box border border-dashed border-base-300 bg-base-100 p-4 text-center text-sm text-base-content/60">
          No differences — the lists match.
        </p>
      ) : null}

      <DiffGroup title="Adds" tone="success" prefix="+" entries={result.adds} />
      <DiffGroup title="Cuts" tone="error" prefix="−" entries={result.cuts} />

      {result.changes.length ? (
        <div className="space-y-1.5">
          <h4 className="text-xs font-black uppercase tracking-[0.18em] text-base-content/60">
            Quantity changes ({result.changes.length})
          </h4>
          <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 font-mono text-sm">
            {result.changes.map((change) => (
              <li key={change.oracleId || change.cardName} className="px-3 py-1.5">
                {change.cardName}: {change.fromQuantity} → {change.toQuantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.unrecognized.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm text-warning marker:text-warning">
            {pluralize(result.unrecognized.length, "unrecognized line")}
          </summary>
          <ul className="mt-2 space-y-0.5 pl-4 text-sm text-base-content/70">
            {result.unrecognized.map((line, index) => (
              <li key={`${line}-${index}`} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function DiffGroup({
  title,
  tone,
  prefix,
  entries,
}: {
  title: string
  tone: "success" | "error"
  prefix: string
  entries: DeckDiffResult["adds"]
}) {
  if (!entries.length) return null

  return (
    <div className="space-y-1.5">
      <h4
        className={cn(
          "text-xs font-black uppercase tracking-[0.18em]",
          tone === "success" ? "text-success" : "text-error",
        )}
      >
        {title} ({entries.length})
      </h4>
      <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 font-mono text-sm">
        {entries.map((entry) => (
          <li
            key={entry.oracleId || entry.cardName}
            className={cn("px-3 py-1.5", tone === "success" ? "text-success" : "text-error")}
          >
            {prefix}
            {entry.quantity} {entry.cardName}
          </li>
        ))}
      </ul>
    </div>
  )
}

function deckDiffAsText(result: DeckDiffResult) {
  const lines: string[] = []

  for (const add of result.adds) lines.push(`+${add.quantity} ${add.cardName}`)
  for (const cut of result.cuts) lines.push(`-${cut.quantity} ${cut.cardName}`)
  for (const change of result.changes) {
    lines.push(`~${change.cardName}: ${change.fromQuantity} -> ${change.toQuantity}`)
  }

  return lines.join("\n") || "No differences"
}
