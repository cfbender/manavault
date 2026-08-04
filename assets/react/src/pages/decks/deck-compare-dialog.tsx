import { useApolloClient, useMutation } from "@apollo/client/react"
import { Check, Clipboard, Search } from "lucide-react"
import { useState, type FormEvent, type ReactNode } from "react"
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
import type { DeckDiffMutation } from "../../gql/graphql"
import { refetchActiveQueries } from "../../lib/apollo"
import { cn, pluralize } from "../../lib/utils"
import { DeckDiffDocument } from "./deck-compare-documents"
import { AddDeckCardDocument, UpdateDeckCardsTagDocument } from "./queries"

type SourceMode = "url" | "paste"
type DeckDiffResult = NonNullable<DeckDiffMutation["deckDiff"]>
type AddRow = DeckDiffResult["adds"][number]
type CutRow = DeckDiffResult["cuts"][number]
type ChangeRow = DeckDiffResult["changes"][number]

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
  const [runDeckDiff, diffQuery] = useMutation(DeckDiffDocument)

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

          {result ? (
            <DeckDiffSummary result={result} deckId={deckId} onCopy={() => copyDiff(result)} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Considering-pile row actions ---------------------------------------
//
// Every add/cut/downward-change row can be pushed into the deck's
// "Considering" pile (adds -> zone: considering) or flagged for review
// (cuts/downward changes -> tag: consider_cutting). Rows are tracked by
// their stable `cardName` key since a card only ever appears once across
// adds/cuts/changes within a single diff.

type RowStatus = "idle" | "pending" | "done"
type BulkAddProgress = { current: number; total: number } | null

function useCompareActions(deckId: string) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [addDeckCard] = useMutation(AddDeckCardDocument)
  const [updateDeckCardsTag] = useMutation(UpdateDeckCardsTagDocument)
  const [rowStatus, setRowStatus] = useState<Map<string, RowStatus>>(new Map())
  const [bulkAddProgress, setBulkAddProgress] = useState<BulkAddProgress>(null)
  const [bulkCutStatus, setBulkCutStatus] = useState<RowStatus>("idle")

  function setStatus(cardName: string, status: RowStatus) {
    setRowStatus((current) => new Map(current).set(cardName, status))
  }

  async function addToConsidering(row: Pick<AddRow, "cardName" | "quantity">) {
    setStatus(row.cardName, "pending")
    try {
      await addDeckCard({
        variables: {
          deckId,
          input: { name: row.cardName, quantity: row.quantity, zone: "considering" },
        },
      })
      await refetchActiveQueries(client)
      setStatus(row.cardName, "done")
    } catch (error) {
      setStatus(row.cardName, "idle")
      showToast(error instanceof Error ? error.message : `Could not add ${row.cardName}`, {
        tone: "info",
      })
    }
  }

  async function considerCutting(row: Pick<CutRow | ChangeRow, "cardName" | "deckCardIds">) {
    if (!row.deckCardIds.length) return
    setStatus(row.cardName, "pending")
    try {
      await updateDeckCardsTag({
        variables: { deckCardIds: [...row.deckCardIds], tag: "consider_cutting" },
      })
      await refetchActiveQueries(client)
      setStatus(row.cardName, "done")
    } catch (error) {
      setStatus(row.cardName, "idle")
      showToast(
        error instanceof Error ? error.message : `Could not tag ${row.cardName} for cutting`,
        { tone: "info" },
      )
    }
  }

  async function addAllToConsidering(rows: readonly AddRow[]) {
    if (bulkAddProgress) return
    const actionable = rows.filter((row) => row.oracleId && rowStatus.get(row.cardName) !== "done")
    if (!actionable.length) return

    setBulkAddProgress({ current: 0, total: actionable.length })
    for (let index = 0; index < actionable.length; index += 1) {
      const row = actionable[index]
      setBulkAddProgress({ current: index + 1, total: actionable.length })
      setStatus(row.cardName, "pending")
      try {
        await addDeckCard({
          variables: {
            deckId,
            input: { name: row.cardName, quantity: row.quantity, zone: "considering" },
          },
        })
        setStatus(row.cardName, "done")
      } catch (error) {
        setStatus(row.cardName, "idle")
        showToast(error instanceof Error ? error.message : `Could not add ${row.cardName}`, {
          tone: "info",
        })
      }
    }
    setBulkAddProgress(null)
    await refetchActiveQueries(client)
  }

  async function markAllConsiderCutting(
    cuts: readonly CutRow[],
    downwardChanges: readonly ChangeRow[],
  ) {
    if (bulkCutStatus === "pending") return

    const rows = [...cuts, ...downwardChanges].filter(
      (row) => row.deckCardIds.length && rowStatus.get(row.cardName) !== "done",
    )
    const deckCardIds = [...new Set(rows.flatMap((row) => row.deckCardIds))]
    if (!deckCardIds.length) return

    rows.forEach((row) => setStatus(row.cardName, "pending"))
    setBulkCutStatus("pending")
    try {
      await updateDeckCardsTag({ variables: { deckCardIds, tag: "consider_cutting" } })
      await refetchActiveQueries(client)
      rows.forEach((row) => setStatus(row.cardName, "done"))
      setBulkCutStatus("done")
    } catch (error) {
      rows.forEach((row) => setStatus(row.cardName, "idle"))
      setBulkCutStatus("idle")
      showToast(error instanceof Error ? error.message : "Could not tag cards for cutting", {
        tone: "info",
      })
    }
  }

  return {
    rowStatus,
    bulkAddProgress,
    bulkCutStatus,
    addToConsidering,
    considerCutting,
    addAllToConsidering,
    markAllConsiderCutting,
  }
}

function RowActionButton({
  status,
  label,
  doneLabel,
  onClick,
  disabled,
  title,
}: {
  status: RowStatus
  label: string
  doneLabel: string
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  if (status === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-success">
        <Check className="h-3.5 w-3.5" />
        {doneLabel}
      </span>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      onClick={onClick}
      disabled={disabled || status === "pending"}
      title={title}
    >
      {status === "pending" ? "Working…" : label}
    </Button>
  )
}

function DeckDiffSummary({
  result,
  deckId,
  onCopy,
}: {
  result: DeckDiffResult
  deckId: string
  onCopy: () => void
}) {
  const hasChanges = result.adds.length || result.cuts.length || result.changes.length
  const downwardChanges = result.changes.filter((change) => change.toQuantity < change.fromQuantity)
  const {
    rowStatus,
    bulkAddProgress,
    bulkCutStatus,
    addToConsidering,
    considerCutting,
    addAllToConsidering,
    markAllConsiderCutting,
  } = useCompareActions(deckId)

  const addsActionable = result.adds.some(
    (add) => add.oracleId && rowStatus.get(add.cardName) !== "done",
  )
  const cuttableRows = [...result.cuts, ...downwardChanges].filter(
    (row) => row.deckCardIds.length && rowStatus.get(row.cardName) !== "done",
  )

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

      <DiffGroup
        title="Adds"
        tone="success"
        prefix="+"
        entries={result.adds}
        headerAction={
          result.adds.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void addAllToConsidering(result.adds)}
              disabled={Boolean(bulkAddProgress) || !addsActionable}
            >
              {bulkAddProgress
                ? `Adding ${bulkAddProgress.current}/${bulkAddProgress.total}…`
                : "Add all to considering"}
            </Button>
          ) : null
        }
        renderAction={(row) => (
          <RowActionButton
            status={rowStatus.get(row.cardName) ?? "idle"}
            label="Add to considering"
            doneLabel="Added"
            onClick={() => void addToConsidering(row)}
            disabled={!row.oracleId}
            title={row.oracleId ? undefined : "Unrecognized card name — can't resolve to a card"}
          />
        )}
      />
      <DiffGroup
        title="Cuts"
        tone="error"
        prefix="−"
        entries={result.cuts}
        headerAction={
          result.cuts.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void markAllConsiderCutting(result.cuts, downwardChanges)}
              disabled={bulkCutStatus === "pending" || !cuttableRows.length}
            >
              {bulkCutStatus === "pending" ? "Tagging…" : "Mark all consider cutting"}
            </Button>
          ) : null
        }
        renderAction={(row) =>
          row.deckCardIds.length ? (
            <RowActionButton
              status={rowStatus.get(row.cardName) ?? "idle"}
              label="Consider cutting"
              doneLabel="Tagged"
              onClick={() => void considerCutting(row)}
            />
          ) : null
        }
      />

      {result.changes.length ? (
        <div className="space-y-1.5">
          <h4 className="text-xs font-black uppercase tracking-[0.18em] text-base-content/60">
            Quantity changes ({result.changes.length})
          </h4>
          <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 font-mono text-sm">
            {result.changes.map((change) => (
              <li
                key={change.oracleId || change.cardName}
                className="flex items-center justify-between gap-3 px-3 py-1.5"
              >
                <span>
                  {change.cardName}: {change.fromQuantity} → {change.toQuantity}
                </span>
                {change.toQuantity < change.fromQuantity && change.deckCardIds.length ? (
                  <RowActionButton
                    status={rowStatus.get(change.cardName) ?? "idle"}
                    label="Consider cutting"
                    doneLabel="Tagged"
                    onClick={() => void considerCutting(change)}
                  />
                ) : null}
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

function DiffGroup<T extends { cardName: string; quantity: number; oracleId: string | null }>({
  title,
  tone,
  prefix,
  entries,
  headerAction,
  renderAction,
}: {
  title: string
  tone: "success" | "error"
  prefix: string
  entries: readonly T[]
  headerAction?: ReactNode
  renderAction?: (entry: T) => ReactNode
}) {
  if (!entries.length) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4
          className={cn(
            "text-xs font-black uppercase tracking-[0.18em]",
            tone === "success" ? "text-success" : "text-error",
          )}
        >
          {title} ({entries.length})
        </h4>
        {headerAction}
      </div>
      <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 font-mono text-sm">
        {entries.map((entry) => (
          <li
            key={entry.oracleId || entry.cardName}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-1.5",
              tone === "success" ? "text-success" : "text-error",
            )}
          >
            <span>
              {prefix}
              {entry.quantity} {entry.cardName}
            </span>
            {renderAction ? renderAction(entry) : null}
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
