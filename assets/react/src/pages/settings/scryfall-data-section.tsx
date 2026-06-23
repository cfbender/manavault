import { RefreshCw, ServerCog } from "lucide-react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"

export function ScryfallDataSection({
  catalogPending,
  assetPending,
  onReloadCatalog,
  onReloadAssets,
}: {
  catalogPending: boolean
  assetPending: boolean
  onReloadCatalog: () => void
  onReloadAssets: () => void
}) {
  return (
    <PageSection title="Scryfall data" count="Manual reloads">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-6">
          <div className="flex items-center gap-3">
            <ServerCog className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Catalog and assets</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Force a fresh Scryfall catalog import when local card data looks stale.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onReloadCatalog} disabled={catalogPending}>
              <RefreshCw className="h-4 w-4" />
              {catalogPending ? "Queueing..." : "Reload Scryfall catalog"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReloadAssets}
              disabled={assetPending}
            >
              <RefreshCw className="h-4 w-4" />
              {assetPending ? "Queueing..." : "Reload symbols and set icons"}
            </Button>
          </div>
        </div>
      </div>
    </PageSection>
  )
}
