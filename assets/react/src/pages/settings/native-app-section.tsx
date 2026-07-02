import { RefreshCw, Save, Smartphone } from "lucide-react"
import type { FormEvent } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import type { NativeShellSettings, NativeShellUpdateCheck } from "../../lib/native-shell"
import { safeHttpUrl } from "../../lib/utils"
import { Alert, Field, StatusLine } from "./ui"

export type NativeAppSectionProps = {
  serverUrl: string
  setServerUrl: (value: string) => void
  settings: NativeShellSettings | null
  update: NativeShellUpdateCheck | null
  loading: boolean
  updateLoading: boolean
  message: string | null
  error: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClear: () => void
  onCheckUpdates: () => void
}

export function NativeAppSection({
  serverUrl,
  setServerUrl,
  settings,
  update,
  loading,
  updateLoading,
  message,
  error,
  onSubmit,
  onClear,
  onCheckUpdates,
}: NativeAppSectionProps) {
  const insecureServerUrl = serverUrl.trim().toLowerCase().startsWith("http://")

  return (
    <PageSection title="Mobile app" count="Native shell">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5 p-6">
          <div className="flex items-center gap-3">
            <Smartphone className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Server and updates</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Change the native shell target here. App launch and shared imports open the saved
                server directly.
              </p>
            </div>
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}

          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_auto]">
            <Field label="ManaVault server URL" htmlFor="native-server-url">
              <Input
                id="native-server-url"
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="https://manavault.example.com"
                disabled={loading}
              />
              {insecureServerUrl ? (
                <Alert tone="warning">
                  This URL uses http://, so your password and session cookie are sent unencrypted.
                  Use https:// unless this is a trusted local network you control.
                </Alert>
              ) : null}
            </Field>
            <div className="flex items-end gap-3">
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4" />
                Save server
              </Button>
              <Button type="button" variant="outline" onClick={onClear} disabled={loading}>
                Clear
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCheckUpdates}
              disabled={updateLoading}
            >
              <RefreshCw className="h-4 w-4" />
              {updateLoading ? "Checking..." : "Check for app update"}
            </Button>
            {update?.updateAvailable && safeHttpUrl(update.releaseUrl) ? (
              <Button
                type="button"
                onClick={() => {
                  const releaseUrl = safeHttpUrl(update?.releaseUrl)
                  if (releaseUrl) window.open(releaseUrl, "_blank", "noopener")
                }}
              >
                Open GitHub release
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 border-t border-base-300 pt-4 text-sm md:grid-cols-2">
            <StatusLine
              label="Configured server"
              status={settings?.serverUrl ?? "Not configured"}
              message="Saved on this device."
            />
            <StatusLine
              label="Mobile app version"
              status={settings?.appVersion ?? "Unknown"}
              message={
                update?.latestVersion
                  ? `Latest GitHub release: ${update.latestVersion}`
                  : "Update checks run only when requested."
              }
            />
          </div>
        </div>
      </div>
    </PageSection>
  )
}
