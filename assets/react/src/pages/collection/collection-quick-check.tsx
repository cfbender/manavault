import { useMutation } from "@apollo/client/react"
import {
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Layers3,
  Link2,
  PackageCheck,
  Search,
  ShoppingCart,
  X,
} from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { EmptyState } from "../../components/card-image"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../components/ui/toast"
import { cn, pluralize } from "../../lib/utils"
import { BuylistMarketplaceActions } from "../decks/buylist-marketplace-actions"
import type { BuylistEntry } from "../decks/deck-types"
import { CollectionCheckDocument } from "./documents"
import type { CollectionCheckCard, CollectionCheckResult } from "./types"

type SourceMode = "paste" | "url"
type ResultFilter = "all" | "ready" | "source"

export function CollectionQuickCheck({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [mode, setMode] = useState<SourceMode>("paste")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [includeConsidering, setIncludeConsidering] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<CollectionCheckResult | null>(null)
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all")
  const { showToast } = useToast()
  const [runCollectionCheck, checkState] = useMutation(CollectionCheckDocument)

  if (!open) return null

  function selectMode(nextMode: SourceMode) {
    setMode(nextMode)
    setFormError(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedUrl = url.trim()
    const trimmedText = text.trim()

    if (mode === "url" && !trimmedUrl) {
      setFormError("Paste a supported deck link to check.")
      return
    }

    if (mode === "paste" && !trimmedText) {
      setFormError("Paste at least one card to check.")
      return
    }

    setFormError(null)
    setResult(null)
    void runCollectionCheck({
      variables: {
        url: mode === "url" ? trimmedUrl : undefined,
        text: mode === "paste" ? trimmedText : undefined,
        includeConsidering,
      },
    })
      .then(({ data }) => {
        if (!data?.collectionCheck) return
        setResult(data.collectionCheck)
        setResultFilter(
          data.collectionCheck.cards.some((card) => card.toSource > 0) ? "source" : "all",
        )
      })
      .catch(() => undefined)
  }

  async function copyBuyList() {
    if (!result) return

    const buyList = result.cards
      .filter((card) => card.toSource > 0)
      .map((card) => `${card.toSource} ${card.cardName}`)
      .join("\n")

    try {
      await navigator.clipboard.writeText(buyList)
      showToast("Cards to source copied")
    } catch {
      showToast("Could not copy from this browser")
    }
  }

  const errorMessage = checkState.error
    ? checkState.error instanceof Error
      ? checkState.error.message
      : "Could not check this list"
    : null

  return (
    <section
      id="collection-quick-check"
      aria-labelledby="collection-quick-check-title"
      className="mb-7 overflow-hidden rounded-box border border-primary/25 bg-base-100 shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-base-300 bg-base-200/70 px-4 py-4 sm:px-5">
        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-primary text-primary-content shadow-sm">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="collection-quick-check-title" className="text-xl font-black">
            Check a deck against your collection
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-base-content/70">
            See what is ready to pull, tied up in another deck, or still needs buying—without
            creating a deck.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 min-h-10 w-10"
          aria-label="Close collection check"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <form onSubmit={submit} className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <div
            className="inline-flex rounded-btn border border-base-300 bg-base-200 p-1"
            role="group"
            aria-label="List source"
          >
            <SourceModeButton
              active={mode === "paste"}
              icon={Clipboard}
              label="Paste list"
              onClick={() => selectMode("paste")}
            />
            <SourceModeButton
              active={mode === "url"}
              icon={Link2}
              label="Deck link"
              onClick={() => selectMode("url")}
            />
          </div>

          {mode === "paste" ? (
            <label className="block space-y-2">
              <span className="text-sm font-bold">Card or deck list</span>
              <Textarea
                aria-label="Card or deck list"
                autoFocus
                className="min-h-36 resize-none bg-base-100 font-mono text-sm leading-6 sm:resize-y"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"1 Sol Ring\n2 Lightning Bolt (M11) 146\n1 Atraxa, Praetors' Voice"}
              />
              <span className="block text-xs text-base-content/70">
                ManaBox exports and standard quantity + card-name lists work here.
              </span>
            </label>
          ) : (
            <label className="block space-y-2">
              <span className="text-sm font-bold">Deck link</span>
              <Input
                aria-label="Deck link"
                autoFocus
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://moxfield.com/decks/..."
              />
              <span className="block text-xs text-base-content/70">
                Supports Moxfield, Archidekt, and ManaVault shared deck links. For ManaBox, paste
                its text export instead.
              </span>
            </label>
          )}

          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={includeConsidering}
              onChange={(event) => setIncludeConsidering(event.target.checked)}
            />
            Include considering and sideboard cards
          </label>

          {formError ? (
            <p role="alert" className="rounded-btn bg-error/10 px-3 py-2 text-sm text-error">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex items-end lg:pb-0.5">
          <Button type="submit" className="w-full lg:w-auto" disabled={checkState.loading}>
            <Search className="h-4 w-4" />
            {checkState.loading
              ? "Checking collection..."
              : result
                ? "Check again"
                : "Check collection"}
          </Button>
        </div>
      </form>

      {errorMessage ? (
        <div className="mx-4 mb-5 rounded-btn bg-error/10 px-4 py-3 text-sm text-error sm:mx-5">
          <p className="font-bold">This list could not be checked.</p>
          <p className="mt-1">{errorMessage}</p>
        </div>
      ) : null}

      {checkState.loading ? <CollectionCheckLoading /> : null}
      {!checkState.loading && result ? (
        <CollectionCheckResults
          filter={resultFilter}
          result={result}
          onCopyBuyList={copyBuyList}
          onFilterChange={setResultFilter}
        />
      ) : null}
    </section>
  )
}

function SourceModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Clipboard
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-btn px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary text-primary-content shadow-sm"
          : "text-base-content/70 hover:text-base-content",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function CollectionCheckLoading() {
  return (
    <div className="border-t border-base-300 px-4 py-5 sm:px-5" aria-live="polite">
      <p className="sr-only">Checking collection availability and prices</p>
      <div className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-2 bg-base-100 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-base-300" />
            <div className="h-6 w-14 animate-pulse rounded bg-base-300" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CollectionCheckResults({
  filter,
  onCopyBuyList,
  onFilterChange,
  result,
}: {
  filter: ResultFilter
  onCopyBuyList: () => void
  onFilterChange: (filter: ResultFilter) => void
  result: CollectionCheckResult
}) {
  const filteredCards = useMemo(
    () =>
      result.cards.filter((card) => {
        if (filter === "ready") return card.toSource === 0
        if (filter === "source") return card.toSource > 0
        return true
      }),
    [filter, result.cards],
  )
  const readyCardCount = result.cards.filter((card) => card.toSource === 0).length
  const sourceCardCount = result.cards.length - readyCardCount
  const buylistEntries = result.cards
    .filter((card) => card.toSource > 0)
    .map(collectionCheckBuylistEntry)
  const sourceQuantity = result.unavailableQuantity + result.missingQuantity

  return (
    <div className="border-t border-base-300">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-base-200/45 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate font-black">{result.sourceName || "Pasted list"}</p>
          <p className="text-xs text-base-content/70">
            {pluralize(result.entryCount, "list entry", "list entries")} · checked against
            unallocated physical copies
          </p>
        </div>
        {sourceQuantity > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCopyBuyList}>
              <Clipboard className="h-4 w-4" />
              Copy buy list
            </Button>
            <BuylistMarketplaceActions entries={buylistEntries} />
          </div>
        ) : (
          <Badge tone="success" className="h-7 gap-1.5 px-2.5">
            <CheckCircle2 className="h-4 w-4" />
            Ready to build
          </Badge>
        )}
      </div>

      <dl className="grid border-y border-base-300 bg-base-100 sm:grid-cols-5 sm:divide-x sm:divide-base-300">
        <SummaryMetric label="Requested" value={result.requestedQuantity} />
        <SummaryMetric label="Ready to pull" value={result.availableQuantity} tone="success" />
        <SummaryMetric label="In other decks" value={result.unavailableQuantity} tone="warning" />
        <SummaryMetric label="Not owned" value={result.missingQuantity} tone="error" />
        <SummaryMetric
          label="Est. to source"
          value={`${result.estimatedCostText}${result.unpricedQuantity ? "+" : ""}`}
          detail={
            result.unpricedQuantity
              ? `${pluralize(result.unpricedQuantity, "card")} not priced`
              : sourceQuantity
                ? `for ${pluralize(sourceQuantity, "card")}`
                : "nothing to buy"
          }
          tone="primary"
        />
      </dl>

      {result.excludedQuantity ? (
        <p className="border-b border-base-300 bg-base-200/40 px-4 py-2 text-xs text-base-content/70 sm:px-5">
          {pluralize(result.excludedQuantity, "considering or sideboard card")} skipped. Enable the
          option above and check again to include them.
        </p>
      ) : null}

      {result.unrecognized.length ? (
        <div className="border-b border-warning/25 bg-warning/10 px-4 py-3 text-sm sm:px-5">
          <p className="font-bold">
            Could not match {pluralize(result.unrecognized.length, "card name")}
          </p>
          <p className="mt-0.5 text-xs text-base-content/70">
            Check spelling or remove custom section labels, then run the check again.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.unrecognized.map((name) => (
              <li key={name}>
                <Badge tone="warning" className="text-base-content">
                  {name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.cards.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="inline-flex rounded-btn border border-base-300 bg-base-200 p-1">
              <ResultFilterButton
                active={filter === "all"}
                count={result.cards.length}
                label="All"
                onClick={() => onFilterChange("all")}
              />
              <ResultFilterButton
                active={filter === "ready"}
                count={readyCardCount}
                label="Ready"
                onClick={() => onFilterChange("ready")}
              />
              <ResultFilterButton
                active={filter === "source"}
                count={sourceCardCount}
                label="To source"
                onClick={() => onFilterChange("source")}
              />
            </div>
            <p className="text-xs text-base-content/70">Prices use the cheapest known printing.</p>
          </div>

          {filteredCards.length ? (
            <ul className="divide-y divide-base-300 border-t border-base-300">
              {filteredCards.map((card) => (
                <CollectionCheckRow key={card.oracleId} card={card} />
              ))}
            </ul>
          ) : (
            <div className="border-t border-base-300 p-4 sm:p-5">
              <EmptyState
                title={filter === "ready" ? "No cards are fully ready" : "Nothing needs sourcing"}
                description={
                  filter === "ready"
                    ? "Try To source to review the remaining cards."
                    : "Every recognized card in this list is available to pull."
                }
              />
            </div>
          )}
        </>
      ) : (
        <div className="p-4 sm:p-5">
          <EmptyState
            title="No known cards to check"
            description="Fix the unrecognized names above or paste a standard quantity + card-name list."
          />
        </div>
      )}
    </div>
  )
}

function SummaryMetric({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail?: string
  label: string
  tone?: "neutral" | "primary" | "success" | "warning" | "error"
  value: number | string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-base-300 px-4 py-3 last:border-b-0 sm:block sm:border-b-0 sm:px-4 sm:py-4">
      <dt className="text-xs font-bold text-base-content/70">{label}</dt>
      <dd
        className={cn(
          "font-mono text-xl font-black sm:mt-1",
          tone === "primary" && "text-primary",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "error" && "text-error",
        )}
      >
        {value}
        {detail ? (
          <span className="ml-2 font-sans text-xs font-normal text-base-content/70 sm:ml-0 sm:block">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

function ResultFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${label} ${count}`}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-btn px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-base-100 text-primary shadow-sm"
          : "text-base-content/70 hover:text-base-content",
      )}
    >
      {label}
      <span className={cn("font-mono", active ? "text-primary" : "text-base-content/70")}>
        {count}
      </span>
    </button>
  )
}

function CollectionCheckRow({ card }: { card: CollectionCheckCard }) {
  const presentation = cardStatusPresentation(card)
  const StatusIcon = presentation.icon
  const printingLabel = card.setCode
    ? `${card.setCode.toUpperCase()}${card.collectorNumber ? ` #${card.collectorNumber}` : ""}`
    : "Any printing"

  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[3rem_minmax(12rem,1fr)_minmax(13rem,auto)_minmax(8rem,auto)] sm:items-center sm:px-5">
      <div className="h-[4.2rem] w-12 overflow-hidden rounded-btn bg-base-200">
        {card.printing?.imageUrl ? (
          <img
            src={card.printing.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="grid h-full place-items-center text-base-content/35">
            <Layers3 className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold">{card.cardName}</span>
          <Badge
            tone={presentation.tone}
            className={cn(
              "gap-1",
              (presentation.tone === "warning" || presentation.tone === "error") &&
                "text-base-content",
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {presentation.label}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-base-content/70">
          {printingLabel} · {card.owned} owned
        </p>
      </div>

      <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:col-start-auto">
        <span className="font-bold text-success">{card.available} ready</span>
        {card.unavailable ? (
          <span className="font-bold text-base-content">{card.unavailable} in decks</span>
        ) : null}
        {card.missing ? (
          <span className="font-bold text-base-content">{card.missing} not owned</span>
        ) : null}
        <span className="text-base-content/70">of {card.required}</span>
      </div>

      <div className="col-start-2 text-left sm:col-start-auto sm:text-right">
        {card.toSource === 0 ? (
          <span className="text-xs font-bold text-success">No purchase needed</span>
        ) : card.totalPriceText ? (
          <>
            <p className="font-mono font-black">{card.totalPriceText}</p>
            <p className="text-xs text-base-content/70">
              {card.unitPriceText} × {card.toSource}
            </p>
          </>
        ) : (
          <span className="text-xs font-bold text-base-content/70">Price unavailable</span>
        )}
      </div>
    </li>
  )
}

function cardStatusPresentation(card: CollectionCheckCard): {
  icon: typeof PackageCheck
  label: string
  tone: "success" | "warning" | "error" | "primary"
} {
  if (card.status === "basic_land") {
    return { icon: PackageCheck, label: "Basic covered", tone: "success" }
  }
  if (card.status === "ready") {
    return { icon: CheckCircle2, label: "Ready", tone: "success" }
  }
  if (card.status === "partial") {
    return { icon: ShoppingCart, label: "Partial", tone: "warning" }
  }
  if (card.status === "allocated_elsewhere") {
    return { icon: Layers3, label: "In other decks", tone: "primary" }
  }
  return { icon: ShoppingCart, label: "Missing", tone: "error" }
}

function collectionCheckBuylistEntry(card: CollectionCheckCard): BuylistEntry {
  return {
    cardName: card.cardName,
    quantity: card.toSource,
    missing: card.missing,
    unavailable: card.unavailable,
    reason:
      card.missing && card.unavailable
        ? "missing and unavailable"
        : card.missing
          ? "missing"
          : "unavailable",
    finish: null,
    setCode: null,
    collectorNumber: null,
    language: null,
    unitPriceText: card.unitPriceText,
    totalPriceCents: card.totalPriceCents,
    totalPriceText: card.totalPriceText,
  }
}
