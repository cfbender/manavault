import { useQuery } from "@apollo/client/react"
import { EmptyState } from "../../components/card-image"
import { graphqlEndpointContext } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import { pluralize } from "../../lib/utils"
import { WantsListDocument } from "./documents"
import { ShareListActions } from "./share-list-actions"
import type { WantsListQuery } from "../../gql/graphql"

type WantsListEntry = NonNullable<WantsListQuery["wantsList"]>["entries"][number]

export function ShareWantsPage({ token }: { token: string }) {
  usePageTitle("Shared want list")

  const { data, error, loading } = useQuery(WantsListDocument, {
    variables: { id: token },
    context: graphqlEndpointContext("/share/graphql"),
    fetchPolicy: "cache-and-network",
  })

  const wantsList = data?.wantsList
  const entries = wantsList?.entries ?? []
  const isInitialLoading = loading && !data
  const isInvalid = !loading && !wantsList

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
          Shared want list
        </p>
        <h1 className="text-3xl font-black tracking-normal">Want list</h1>
        {entries.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-base-content/60">
              {pluralize(entries.length, "card")} wanted
            </p>
            <ShareListActions entries={entries} filename="want-list.txt" />
          </>
        ) : null}
      </div>

      {error || isInvalid ? (
        <EmptyState
          title="This wants list link is invalid or was revoked"
          description="Ask for a fresh share link from the person who sent you this one."
        />
      ) : isInitialLoading ? (
        <EmptyState title="Loading want list..." />
      ) : entries.length === 0 ? (
        <EmptyState title="This want list is empty" />
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <WantListEntryRow key={`${entry.cardName}-${index}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function WantListEntryRow({ entry }: { entry: WantsListEntry }) {
  const printing = printingLabel(entry)

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
          ) : (
            <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wide text-base-content/40">
              Any printing
            </span>
          )}
        </div>
      </div>

      <span className="shrink-0 rounded-full bg-base-200 px-3 py-1 text-sm font-bold tabular-nums">
        ×{entry.quantity}
      </span>
    </div>
  )
}

function printingLabel(entry: WantsListEntry) {
  const setCode = entry.setCode?.toUpperCase()
  const collectorNumber = entry.collectorNumber
  if (!setCode) return null
  return collectorNumber ? `${setCode} #${collectorNumber}` : setCode
}
