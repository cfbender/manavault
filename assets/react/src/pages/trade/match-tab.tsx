import { useMutation } from "@apollo/client/react"
import { Search } from "lucide-react"
import { useState, type FormEvent } from "react"
import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import type { TradeMatchesMutation } from "../../gql/graphql"
import { cn, pluralize, titleize } from "../../lib/utils"
import { TradeMatchesDocument } from "./match-documents"

type SourceMode = "url" | "paste"
type ListRole = "haves" | "wants"
type TradeMatchResult = NonNullable<TradeMatchesMutation["tradeMatches"]>
type BinderMatch = TradeMatchResult["binderMatches"][number]
type WantMatch = TradeMatchResult["wantMatches"][number]
type BinderMatchItem = BinderMatch["items"][number]

function finishLabel(finish: string) {
  if (finish === "foil") return "Foil"
  if (finish === "etched") return "Etched foil"
  if (finish === "nonfoil") return "Nonfoil"
  return titleize(finish)
}

function FinishBadge({ finish }: { finish: string }) {
  const isFoil = finish === "foil" || finish === "etched"

  return (
    <span
      className={cn(
        "badge badge-sm",
        isFoil ? "border-accent/40 bg-accent/15 text-accent" : "badge-outline text-base-content/70",
      )}
    >
      {finishLabel(finish)}
    </span>
  )
}

function printingLabel(item: BinderMatchItem) {
  const setCode = item.printing?.setCode?.toUpperCase()
  const collectorNumber = item.printing?.collectorNumber
  if (!setCode) return null
  return collectorNumber ? `${setCode} #${collectorNumber}` : setCode
}

export function MatchTab() {
  const [mode, setMode] = useState<SourceMode>("url")
  const [role, setRole] = useState<ListRole>("haves")
  const [url, setUrl] = useState("")
  const [text, setText] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [runTradeMatches, matchQuery] = useMutation(TradeMatchesDocument)

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
    void runTradeMatches({
      variables: {
        url: mode === "url" ? trimmedUrl : undefined,
        text: mode === "paste" ? trimmedText : undefined,
      },
    })
  }

  const result = matchQuery.data?.tradeMatches ?? null
  const errorMessage = matchQuery.error
    ? matchQuery.error instanceof Error
      ? matchQuery.error.message
      : "Could not load matches"
    : null

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-box border border-base-300 bg-base-100 p-5"
        onSubmit={submit}
      >
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-base-300 bg-base-100/60 p-0.5">
            {(["haves", "wants"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                onClick={() => setRole(option)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-bold transition-colors",
                  role === option
                    ? "bg-accent text-accent-content"
                    : "text-base-content/70 hover:text-base-content",
                )}
              >
                {option === "haves" ? "It's their cards" : "It's their wants"}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-base-content/60">
          {role === "haves"
            ? "A deck or trade binder they own — we'll surface the cards on your want list."
            : "A wishlist of cards they're after — we'll surface what you have up for trade."}
        </p>

        {mode === "url" ? (
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Their list link
            </span>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://moxfield.com/decks/... or https://archidekt.com/decks/..."
              autoFocus
            />
            <span className="block text-xs text-base-content/60">
              Supports Moxfield, Archidekt, and ManaVault deck, want-list, or binder share links
              from any instance. ManaBox has no URL export — switch to Paste list and drop in its
              text export instead.
            </span>
          </label>
        ) : (
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Their list text
            </span>
            <Textarea
              className="min-h-40 font-mono text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"1x Jund Charm (C13) 195\n2x Lightning Bolt (M11) 146 *F*"}
              autoFocus
            />
            <span className="block text-xs text-base-content/60">
              Paste a ManaBox export, a wishlist, or any standard decklist text (quantity, name,
              optional set, collector number, and finish).
            </span>
          </label>
        )}

        {formError ? (
          <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-base-300 pt-4">
          <Button type="submit" disabled={matchQuery.loading}>
            <Search className="h-4 w-4" />
            {matchQuery.loading ? "Matching..." : "Find matches"}
          </Button>
        </div>
      </form>

      {errorMessage ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {errorMessage}
        </p>
      ) : null}

      {!result && !matchQuery.loading && !errorMessage ? (
        <EmptyState
          title="Paste a list to see overlaps"
          description="Compare someone else's deck, binder, or want list against your own trade binder and wants to find trades."
        />
      ) : null}

      {matchQuery.loading ? (
        <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
          Matching against your binder and want list...
        </div>
      ) : null}

      {result ? <MatchResults result={result} role={role} /> : null}
    </div>
  )
}

function MatchResults({ result, role }: { result: TradeMatchResult; role: ListRole }) {
  return (
    <div className="space-y-6">
      <div className="rounded-box border border-base-300 bg-base-200/60 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-bold text-base-content">
          <span>{result.sourceName || "Pasted list"}</span>
          <span className="font-normal text-base-content/70">
            {pluralize(result.entryCount, "entry", "entries")}
          </span>
        </div>
        {result.unrecognized.length ? (
          <details className="group mt-2">
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
        ) : (
          <p className="mt-1 text-base-content/60">Every line resolved to a known card.</p>
        )}
      </div>

      {role === "wants" ? (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-accent">
            You have — they want
          </h3>
          {result.binderMatches.length ? (
            <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
              {result.binderMatches.map((match) => (
                <BinderMatchRow key={match.oracleId} match={match} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing on their want list is in your trade binder" />
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-accent">
            They have — you want
          </h3>
          {result.wantMatches.length ? (
            <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
              {result.wantMatches.map((match) => (
                <WantMatchRow key={`${match.oracleId}-${match.want.id}`} match={match} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing in their list is on your want list" />
          )}
        </section>
      )}
    </div>
  )
}

function BinderMatchRow({ match }: { match: BinderMatch }) {
  const totalQuantity = match.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold text-base-content">{match.cardName}</span>
        <span className="text-xs text-base-content/60">
          They want ×{match.theirQuantity} · You have ×{totalQuantity} for trade
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {match.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2 text-sm text-base-content/80"
          >
            <span className="font-mono font-bold">×{item.quantity}</span>
            {printingLabel(item) ? (
              <span className="text-base-content/60">{printingLabel(item)}</span>
            ) : null}
            <FinishBadge finish={item.finish} />
            <span className="text-xs text-base-content/50">{titleize(item.condition)}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

function WantMatchRow({ match }: { match: WantMatch }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 p-4">
      <span className="font-bold text-base-content">{match.cardName}</span>
      <span className="text-xs text-base-content/60">
        They have ×{match.theirQuantity} · You want ×{match.want.quantity}
      </span>
    </li>
  )
}
