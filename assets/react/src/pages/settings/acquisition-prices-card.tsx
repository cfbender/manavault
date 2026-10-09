import { useMutation, useQuery } from "@apollo/client/react"
import { History, RefreshCw } from "lucide-react"
import { useEffect } from "react"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import type { AcquisitionPriceRebuildQuery } from "../../gql/graphql"
import {
  AcquisitionPriceRebuildDocument,
  RebuildAcquisitionPricesDocument,
  errorMessage,
  formatDate,
} from "./data"

const POLL_INTERVAL_MS = 3_000

type Rebuild = NonNullable<AcquisitionPriceRebuildQuery["acquisitionPriceRebuild"]>

const sourceNames: Record<string, string> = {
  scryfall: "Scryfall (TCGplayer history)",
  tcgplayer: "TCGplayer",
  cardkingdom: "Card Kingdom",
  manapool: "ManaPool",
}

function isPending(rebuild: Rebuild | null | undefined) {
  return rebuild?.status === "queued" || rebuild?.status === "running"
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  )
}

function RebuildStatus({ rebuild }: { rebuild: Rebuild }) {
  const source = rebuild.source ? (sourceNames[rebuild.source] ?? rebuild.source) : null

  switch (rebuild.status) {
    case "queued":
      return <p className="text-sm text-base-content/70">Rebuild queued…</p>
    case "running":
      return (
        <p className="text-sm text-base-content/70">
          Rebuilding from {source ?? "the selected source"}: downloading MTGJSON price history…
        </p>
      )
    case "failed":
      return (
        <p className="text-sm text-error">
          Last rebuild failed{rebuild.completedAt ? ` ${formatDate(rebuild.completedAt)}` : ""}
          {rebuild.error ? `: ${rebuild.error}` : "."}
        </p>
      )
    default:
      return (
        <div className="space-y-1 text-sm text-base-content/70">
          <p>
            Last rebuilt {rebuild.completedAt ? formatDate(rebuild.completedAt) : "recently"}
            {source ? ` from ${source}` : ""}
            {rebuild.historyFrom && rebuild.historyTo
              ? ` using history from ${formatDay(rebuild.historyFrom)} to ${formatDay(rebuild.historyTo)}`
              : ""}
            .
          </p>
          <p>
            {rebuild.itemsInWindow.toLocaleString()} items added in that window ·{" "}
            {rebuild.itemsUpdated.toLocaleString()} updated ·{" "}
            {rebuild.itemsWithoutHistory.toLocaleString()} without history
          </p>
        </div>
      )
  }
}

export function AcquisitionPricesCard() {
  const { showToast } = useToast()
  const rebuildQuery = useQuery(AcquisitionPriceRebuildDocument, {
    fetchPolicy: "cache-and-network",
  })
  const [rebuildAcquisitionPrices, rebuildMutation] = useMutation(RebuildAcquisitionPricesDocument)
  const rebuild = rebuildQuery.data?.acquisitionPriceRebuild
  const pending = isPending(rebuild)
  const { startPolling, stopPolling } = rebuildQuery

  useEffect(() => {
    if (pending) startPolling(POLL_INTERVAL_MS)
    else stopPolling()
    return () => stopPolling()
  }, [pending, startPolling, stopPolling])

  function rebuildNow() {
    void rebuildAcquisitionPrices({
      variables: {},
      onCompleted: (data) => {
        const queued = data.rebuildAcquisitionPrices?.rebuild
        if (queued) {
          rebuildQuery.client.writeQuery({
            query: AcquisitionPriceRebuildDocument,
            data: { acquisitionPriceRebuild: queued },
          })
        }
        showToast("Acquisition price rebuild queued.")
      },
      onError: (err) => showToast(errorMessage(err)),
    })
  }

  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4 p-6">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-black tracking-normal">Acquisition prices</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Each card records the market price when it was added, which the Value tab compares
              against. Rebuilding replaces that price for cards added in the last ~90 days with the
              selected source's price on the day they were added, from MTGJSON's daily history.
              Older cards and cards without history keep their current snapshot.
            </p>
          </div>
        </div>

        {rebuildQuery.error ? (
          <p className="text-sm text-error">{errorMessage(rebuildQuery.error)}</p>
        ) : null}

        {rebuild ? (
          <RebuildStatus rebuild={rebuild} />
        ) : rebuildQuery.loading ? null : (
          <p className="text-sm text-base-content/70">Never rebuilt.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={rebuildNow}
            disabled={pending || rebuildMutation.loading}
          >
            <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {rebuildMutation.loading
              ? "Queueing..."
              : pending
                ? "Rebuilding..."
                : "Rebuild from price history"}
          </Button>
        </div>
      </div>
    </div>
  )
}
