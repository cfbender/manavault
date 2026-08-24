import { ChevronDown, Sparkles } from "lucide-react"
import { formatDate } from "../settings/data"
import { DeckBracketBadge } from "./deck-bracket"
import { DeckMarkdown } from "./deck-primer"
import type { DeckDetail } from "./deck-types"

export function DeckAIAnalysis({ deck }: { deck: DeckDetail }) {
  const analysis = deck.aiAnalysis?.trim()

  if (!analysis) return null

  const metadata = [
    deck.aiAnalysisModel,
    deck.aiAnalyzedAt ? `Analyzed ${formatDate(deck.aiAnalyzedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-box bg-warning/15 text-warning">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-black tracking-normal">
              AI deck analysis
              <DeckBracketBadge deck={deck} />
            </span>
            <span className="hidden text-sm text-base-content/65 sm:block">
              Goals, themes, bracket guidance, and tuning ideas
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-base-content/55 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>

      <div className="border-t border-base-300 px-5 py-5 sm:px-6">
        <p className="mb-5 max-w-[65ch] text-sm text-base-content/65">
          AI guidance can miss interactions or table context. Treat this as a starting point and
          refresh it after meaningful deck changes. Bracket reads use the{" "}
          <a
            href="https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
          >
            official October 2025 guidance
          </a>
          .
        </p>

        <DeckMarkdown>{analysis}</DeckMarkdown>

        {metadata ? (
          <p className="mt-6 break-words text-xs text-base-content/60">{metadata}</p>
        ) : null}
      </div>
    </details>
  )
}
