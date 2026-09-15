import { DownloadCloud, RefreshCw } from "lucide-react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { type Provider, formatDate } from "./data"

type CloudBackup = {
  id: string
  name: string
  modifiedAt?: string | null
}

export function RestoreSection({
  backups,
  provider,
  restoreId,
  restorePending,
  refreshPending,
  setRestoreId,
  onStageRestore,
  onRefresh,
}: {
  backups: CloudBackup[]
  provider: Provider
  restoreId: string
  restorePending: boolean
  refreshPending: boolean
  setRestoreId: (value: string) => void
  onStageRestore: () => void
  onRefresh: () => void
}) {
  return (
    <PageSection title="Restore from cloud" count={`${backups.length} backups`}>
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-6">
          <p className="text-base-content/70">
            Restore downloads the selected cloud backup and stages it locally. Restart ManaVault to
            replace the SQLite database before the app starts.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={restoreId} onValueChange={setRestoreId} disabled={backups.length === 0}>
              <SelectTrigger aria-label="Backup">
                <SelectValue placeholder="Choose backup" />
              </SelectTrigger>
              <SelectContent>
                {backups.map((backup) => (
                  <SelectItem key={backup.id} value={backup.id}>
                    {backup.name} {backup.modifiedAt ? `(${formatDate(backup.modifiedAt)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="destructive"
              onClick={onStageRestore}
              disabled={restorePending || !restoreId}
            >
              <DownloadCloud className="h-4 w-4" />
              {restorePending ? "Staging..." : "Stage restore"}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-fit"
            onClick={onRefresh}
            disabled={refreshPending || provider === "none"}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh cloud list
          </Button>
        </div>
      </div>
    </PageSection>
  )
}
