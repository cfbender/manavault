import { useQuery } from "@apollo/client/react"
import { EmptyState } from "../../components/card-image"
import { graphqlEndpointContext } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import { pluralize, titleize } from "../../lib/utils"
import { BinderListDocument } from "./documents"
import { ShareListActions } from "./share-list-actions"
import type { BinderListQuery } from "../../gql/graphql"

type BinderListEntry = NonNullable<BinderListQuery["binderList"]>["entries"][number]

export function ShareBinderPage({ token }: { token: string }) {
  usePageTitle("Shared trade binder")

  const { data, error, loading } = useQuery(BinderListDocument, {
    variables: { id: token },
    context: graphqlEndpointContext("/share/graphql"),
    fetchPolicy: "cache-and-network",
  })

  const binderList = data?.binderList
  const entries = binderList?.entries ?? []
  const isInitialLoading = loading && !data
  const isInvalid = !loading && !binderList

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
          Shared trade binder
        </p>
        <h1 className="text-3xl font-black tracking-normal">Trade binder</h1>
        {entries.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-base-content/60">
              {pluralize(entries.length, "card")} up for trade
            </p>
            <ShareListActions entries={entries} filename="trade-binder.txt" />
          </>
        ) : null}
      </div>

      {error || isInvalid ? (
        <EmptyState
          title="This binder link is invalid or was revoked"
          description="Ask for a fresh share link from the person who sent you this one."
        />
      ) : isInitialLoading ? (
        <EmptyState title="Loading binder..." />
      ) : entries.length === 0 ? (
        <EmptyState title="This trade binder is empty" />
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <BinderListEntryRow key={`${entry.cardName}-${index}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function BinderListEntryRow({ entry }: { entry: BinderListEntry }) {
  const printing = printingLabel(entry)
  const isFoil = entry.finish === "foil" || entry.finish === "etched"

  return (
    <div className="flex items-center gap-4 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-base-200">
        {entry.imageUrl ? (
          <img
            src={entry.imageUrl}
            alt={entry.cardName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-[0.6rem] text-base-content/50">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">{entry.cardName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {entry.typeLine ? (
            <p className="truncate text-sm text-base-content/60">{entry.typeLine}</p>
          ) : null}
          {printing ? (
            <span className="badge badge-sm badge-outline shrink-0 text-base-content/70">
              {printing}
            </span>
          ) : null}
          {isFoil ? (
            <span className="badge badge-sm shrink-0 border-accent/40 bg-accent/15 text-accent">
              {finishLabel(entry.finish)}
            </span>
          ) : null}
          {entry.condition ? (
            <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wide text-base-content/40">
              {titleize(entry.condition)}
            </span>
          ) : null}
        </div>
      </div>

      <span className="shrink-0 rounded-full bg-base-200 px-3 py-1 text-sm font-bold tabular-nums">
        ×{entry.quantity}
      </span>
    </div>
  )
}

function finishLabel(finish: string | null | undefined) {
  if (finish === "foil") return "Foil"
  if (finish === "etched") return "Etched foil"
  return titleize(finish)
}

function printingLabel(entry: BinderListEntry) {
  const setCode = entry.setCode?.toUpperCase()
  const collectorNumber = entry.collectorNumber
  if (!setCode) return null
  return collectorNumber ? `${setCode} #${collectorNumber}` : setCode
}
