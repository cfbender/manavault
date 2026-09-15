import { useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { ExternalLink, ImageOff } from "lucide-react"
import { graphqlEndpointContext } from "../../lib/apollo"
import { CardEdhrecDocument, type CardEdhrecEntry, type CardEdhrecSection } from "./data"

const sectionOrder = ["topcommanders", "newcommanders", "newcards", "highliftcards"]

const sectionCopy: Record<string, string> = {
  topcommanders: "The most-played commanders that include this card.",
  newcommanders: "Recent commanders already pairing with this card.",
  newcards: "Recent releases appearing beside this card.",
  highliftcards: "Cards paired more often than chance predicts.",
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const inclusionPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
})

export function CardSynergies({
  cardName,
  graphqlEndpoint,
}: {
  cardName: string
  graphqlEndpoint?: string
}) {
  const { data, error, loading, previousData } = useQuery(CardEdhrecDocument, {
    variables: { name: cardName },
    context: graphqlEndpointContext(graphqlEndpoint),
    fetchPolicy: graphqlEndpoint ? "no-cache" : "cache-and-network",
  })
  const edhrec = data?.cardEdhrec ?? previousData?.cardEdhrec
  const sectionsByTag = new Map(edhrec?.sections.map((section) => [section.tag, section]))

  return (
    <details className="group max-w-4xl rounded-box border border-base-300/70 bg-base-100/80 shadow-sm backdrop-blur">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black tracking-normal text-base-content marker:text-base-content/60">
        Synergies
      </summary>

      <div className="border-t border-base-300/70 px-4 py-3">
        {loading && !edhrec ? <SynergyMessage>Loading EDHREC relationships…</SynergyMessage> : null}
        {error && !edhrec ? (
          <SynergyMessage>
            EDHREC relationships are unavailable right now. The rest of this card record is still
            ready to use.
          </SynergyMessage>
        ) : null}
        {edhrec ? (
          <>
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
              {sectionOrder.map((tag) => (
                <SynergySection key={tag} section={sectionsByTag.get(tag)} tag={tag} />
              ))}
            </div>
            <a
              href={edhrec.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-field text-xs font-bold text-base-content/65 underline decoration-base-content/30 underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              Explore full data on EDHREC
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </>
        ) : null}
      </div>
    </details>
  )
}

function SynergySection({ section, tag }: { section?: CardEdhrecSection; tag: string }) {
  const heading = section?.header ?? fallbackHeading(tag)

  return (
    <section className="min-w-0 border-t border-base-300/80 pt-3">
      <h3 className="text-sm font-black text-base-content">{heading}</h3>
      <p className="mt-1 text-xs leading-5 text-base-content/60">{sectionCopy[tag]}</p>
      {section?.cards.length ? (
        <ol className="mt-3 space-y-1">
          {section.cards.map((card) => (
            <li key={`${tag}-${card.scryfallId || card.name}`}>
              <SynergyCard entry={card} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs font-semibold text-base-content/50">No matches yet</p>
      )}
    </section>
  )
}

function SynergyCard({ entry }: { entry: CardEdhrecEntry }) {
  const imageUrl = entry.card?.primaryPrinting?.imageUrl || scryfallImageUrl(entry.scryfallId)
  const content = (
    <>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="aspect-[5/7] h-13 rounded-field object-cover shadow-sm"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="flex aspect-[5/7] h-13 items-center justify-center rounded-field border border-base-300 bg-base-200 text-base-content/40">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 self-center">
        <span className="line-clamp-2 block text-xs font-bold leading-4 text-base-content">
          {entry.name}
        </span>
        <span className="mt-0.5 block font-mono text-xs font-bold leading-4 tabular-nums text-base-content/55">
          {entryMetric(entry)}
        </span>
      </span>
    </>
  )
  const className =
    "grid min-h-14 grid-cols-[2.35rem_minmax(0,1fr)] gap-2 rounded-field px-1.5 py-1 transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"

  return entry.card ? (
    <Link
      to="/cards/$id"
      params={{ id: entry.card.id }}
      search={{}}
      className={className}
      aria-label={`View ${entry.name} in ManaVault`}
    >
      {content}
    </Link>
  ) : (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      aria-label={`View ${entry.name} on EDHREC`}
    >
      {content}
    </a>
  )
}

function SynergyMessage({ children }: { children: string }) {
  return <p className="text-sm leading-6 text-base-content/65">{children}</p>
}

function entryMetric(entry: CardEdhrecEntry) {
  const decks = entry.numDecks ? `${compactNumber.format(entry.numDecks)} decks` : null

  if (entry.lift != null) {
    const lift = entry.lift < 10 ? entry.lift.toFixed(1) : Math.round(entry.lift).toString()
    return [`${lift}× lift`, decks].filter(Boolean).join(" · ")
  }

  const inclusion =
    entry.numDecks != null && entry.potentialDecks
      ? `${inclusionPercent.format(entry.numDecks / entry.potentialDecks)} include`
      : null

  return [inclusion, decks].filter(Boolean).join(" · ") || "EDHREC match"
}

function fallbackHeading(tag: string) {
  switch (tag) {
    case "topcommanders":
      return "Top Commanders"
    case "newcommanders":
      return "New Commanders"
    case "newcards":
      return "New Cards"
    default:
      return "High Lift Cards"
  }
}

function scryfallImageUrl(id?: string | null) {
  const scryfallId = id?.toLowerCase()
  if (!scryfallId || !/^[a-f0-9-]{36}$/.test(scryfallId)) return null
  return `https://cards.scryfall.io/small/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
