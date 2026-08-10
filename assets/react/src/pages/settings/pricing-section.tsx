import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Check, CircleDollarSign, RefreshCw } from "lucide-react"
import { useState } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { cn } from "../../lib/utils"
import {
  PricingSettingsDocument,
  SyncVendorPricesDocument,
  UpdatePricingSettingsDocument,
  errorMessage,
  formatDate,
} from "./data"

const sourceLabels: Record<string, { label: string; description: string }> = {
  scryfall: {
    label: "Scryfall",
    description: "Prices bundled with the Scryfall catalog import. Updated with catalog syncs.",
  },
  tcgplayer: {
    label: "TCGplayer",
    description: "Market prices via tcgtracking.com, including special treatments. Updated daily.",
  },
  cardkingdom: {
    label: "Card Kingdom",
    description: "NM retail prices from Card Kingdom's price list. Updated every 6 hours.",
  },
  manapool: {
    label: "ManaPool",
    description: "Lowest listing prices from ManaPool. Updated every 6 hours.",
  },
}

export function PricingSection() {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [pendingSource, setPendingSource] = useState<string | null>(null)

  const settingsQuery = useQuery(PricingSettingsDocument, {
    fetchPolicy: "cache-and-network",
  })

  const [updatePricingSettings, updateMutation] = useMutation(UpdatePricingSettingsDocument)
  const [syncVendorPrices, syncMutation] = useMutation(SyncVendorPricesDocument)
  const settings =
    settingsQuery.data?.pricingSettings ??
    updateMutation.data?.updatePricingSettings?.pricingSettings
  const selectedSource = pendingSource ?? settings?.source

  function selectSource(source: string) {
    if (!settings || source === selectedSource) return

    setPendingSource(source)

    void updatePricingSettings({
      variables: { source },
      onCompleted: (data) => {
        const pricingSettings = data.updatePricingSettings?.pricingSettings

        setPendingSource(null)
        if (!pricingSettings) return

        client.writeQuery({
          query: PricingSettingsDocument,
          data: { pricingSettings },
        })
        showToast("Price source updated.")
        void client.resetStore().catch((err: unknown) => showToast(errorMessage(err)))
      },
      onError: (err) => {
        setPendingSource(null)
        showToast(errorMessage(err))
      },
    })
  }

  function syncNow() {
    void syncVendorPrices({
      variables: {},
      onCompleted: () => showToast("Vendor price sync queued."),
      onError: (err) => showToast(errorMessage(err)),
    })
  }

  const vendorStatus = new Map(
    (settings?.vendors ?? []).map((vendor) => [vendor.vendor, vendor] as const),
  )

  return (
    <PageSection title="Pricing" count="Price source">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-6">
          <div className="flex items-center gap-3">
            <CircleDollarSign className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Price source</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Choose where card prices come from. Vendor sources fall back to Scryfall for
                printings they don't stock.
              </p>
            </div>
          </div>

          {settingsQuery.error ? (
            <p className="text-sm text-error">{errorMessage(settingsQuery.error)}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {(settings?.sources ?? []).map((source) => {
              const selected = selectedSource === source
              const meta = sourceLabels[source] ?? { label: source, description: "" }
              const status = vendorStatus.get(source)

              return (
                <button
                  key={source}
                  type="button"
                  aria-pressed={selected}
                  disabled={updateMutation.loading}
                  onClick={() => selectSource(source)}
                  className={cn(
                    "flex items-start gap-3 rounded-box border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                    selected
                      ? "border-primary/50 bg-primary/10"
                      : "border-base-300 bg-base-200/40 hover:border-primary/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-bold">
                      {meta.label}
                      {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-base-content/60">{meta.description}</p>
                    {status ? (
                      <p className="mt-1 text-xs text-base-content/50">
                        {status.priceCount > 0
                          ? `${status.priceCount.toLocaleString()} prices · synced ${
                              status.lastSyncedAt ? formatDate(status.lastSyncedAt) : "never"
                            }`
                          : "Not synced yet"}
                      </p>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={syncNow}
              disabled={syncMutation.loading}
            >
              <RefreshCw className="h-4 w-4" />
              {syncMutation.loading ? "Queueing..." : "Sync vendor prices now"}
            </Button>
          </div>
        </div>
      </div>
    </PageSection>
  )
}
