import { Badge } from "../../components/ui/badge"
import { cn, present, titleize } from "../../lib/utils"
import { CARD_LEGALITY_FORMATS, type CardDetail, type CardLegality, type CardRuling } from "./data"

export function CardTagSummary({ card }: { card: CardDetail }) {
  const themes = (card.deckThemes || []).filter(present)
  const oracleTags = (card.oracleTags || []).filter(present)
  const hasCategory = Boolean(card.deckCategory)

  if (!hasCategory && themes.length === 0 && oracleTags.length === 0) return null

  return (
    <div className="flex flex-col gap-3 text-sm">
      {hasCategory ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-base-content/70">Category</span>
          <Badge tone="primary">{titleize(card.deckCategory)}</Badge>
        </div>
      ) : null}

      {themes.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-base-content/70">Themes</span>
          {themes.map((theme) => (
            <Badge key={theme}>{titleize(theme)}</Badge>
          ))}
        </div>
      ) : null}

      {oracleTags.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-base-content/70">Scryfall tags</span>
          {oracleTags.map((tag) => (
            <Badge key={tag.id} title={tag.annotation || tag.weight || undefined}>
              {tag.label}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function CardLegalityPanel({
  gameChanger = false,
  legalities,
}: {
  gameChanger?: boolean | null
  legalities?: CardLegality[] | null
}) {
  const presentLegalities = legalities?.filter(present) ?? []

  if (presentLegalities.length === 0) return null

  const statusesByFormat: Record<string, string | null> = {}
  for (const legality of presentLegalities) {
    if (legality.format) statusesByFormat[legality.format.toLowerCase()] = legality.status
  }

  return (
    <details className="group max-w-4xl rounded-box border border-base-300/70 bg-base-100/80 shadow-sm backdrop-blur">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black tracking-normal text-base-content marker:text-base-content/60">
        Legalities
      </summary>

      <dl className="grid gap-2 border-t border-base-300/70 px-4 py-3 sm:grid-cols-2">
        {CARD_LEGALITY_FORMATS.map((format) => {
          const isLegal = statusesByFormat[format.key] === "legal"
          const isCommanderGameChanger =
            isLegal && gameChanger === true && format.key === "commander"
          const legalityLabel = isLegal
            ? isCommanderGameChanger
              ? "LEGAL/GC"
              : "LEGAL"
            : "NOT LEGAL"

          return (
            <div
              key={format.key}
              className="flex items-center justify-between gap-3 rounded-lg bg-base-200/45 px-3 py-2"
            >
              <dt className="text-sm font-semibold text-base-content/75">{format.label}</dt>
              <dd>
                <Badge
                  tone={isCommanderGameChanger ? "warning" : isLegal ? "success" : "neutral"}
                  className={cn(
                    "min-w-20 justify-center text-[0.65rem] font-black uppercase tracking-wide",
                    !isLegal && "border-base-content/20 text-base-content/50",
                  )}
                >
                  {legalityLabel}
                </Badge>
              </dd>
            </div>
          )
        })}
      </dl>
    </details>
  )
}

export function CardRulings({ rulings }: { rulings?: CardRuling[] | null }) {
  if (!rulings?.length) return null

  return (
    <details className="group max-w-4xl rounded-box border border-base-300/70 bg-base-100/80 shadow-sm backdrop-blur">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black tracking-normal text-base-content marker:text-base-content/60">
        Rulings ({rulings.length})
      </summary>

      <ul className="space-y-3 border-t border-base-300/70 px-4 py-3 text-sm leading-6 text-base-content/75">
        {rulings.map((ruling, index) => (
          <li
            key={`${ruling.publishedAt || "undated"}-${ruling.source || "unknown"}-${index}`}
            className="space-y-1"
          >
            {ruling.publishedAt || ruling.source ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                {ruling.publishedAt ? (
                  <time dateTime={ruling.publishedAt}>{ruling.publishedAt}</time>
                ) : null}
                {ruling.publishedAt && ruling.source ? " · " : null}
                {ruling.source}
              </p>
            ) : null}
            <p className="whitespace-pre-line">{ruling.comment}</p>
          </li>
        ))}
      </ul>
    </details>
  )
}
