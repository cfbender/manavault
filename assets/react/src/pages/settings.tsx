import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cloud, DatabaseBackup, DownloadCloud, RefreshCw, Save, ServerCog } from "lucide-react"
import type { FormEvent, ReactNode } from "react"
import { useEffect, useState } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"

const BackupSettingsDocument = graphql(`
  query BackupSettings {
    backupSettings {
      enabled
      provider
      cron
      s3Endpoint
      s3Bucket
      s3Region
      s3Prefix
      s3AccessKeyId
      hasS3SecretAccessKey
      googleClientId
      googleFolderId
      hasGoogleClientSecret
      hasGoogleRefreshToken
      lastBackupAt
      lastBackupStatus
      lastBackupMessage
      lastBackupPath
      lastRestoreAt
      lastRestoreStatus
      lastRestoreMessage
      pendingRestorePath
    }
  }
`)

const CloudBackupsDocument = graphql(`
  query CloudBackups {
    cloudBackups {
      id
      name
      provider
      size
      modifiedAt
    }
  }
`)

const UpdateBackupSettingsDocument = graphql(`
  mutation UpdateBackupSettings($input: BackupSettingsInput!) {
    updateBackupSettings(input: $input) {
      enabled
      provider
      cron
      s3Endpoint
      s3Bucket
      s3Region
      s3Prefix
      s3AccessKeyId
      hasS3SecretAccessKey
      googleClientId
      googleFolderId
      hasGoogleClientSecret
      hasGoogleRefreshToken
      lastBackupAt
      lastBackupStatus
      lastBackupMessage
      lastBackupPath
      lastRestoreAt
      lastRestoreStatus
      lastRestoreMessage
      pendingRestorePath
    }
  }
`)

const RunCloudBackupDocument = graphql(`
  mutation RunCloudBackup {
    runCloudBackup {
      id
      name
      provider
      status
      message
      size
      modifiedAt
    }
  }
`)

const StageCloudRestoreDocument = graphql(`
  mutation StageCloudRestore($id: ID!) {
    stageCloudRestore(id: $id) {
      status
      message
      path
    }
  }
`)

const ReloadScryfallCatalogDocument = graphql(`
  mutation ReloadScryfallCatalog {
    reloadScryfallCatalog {
      status
      message
    }
  }
`)

const ReloadScryfallAssetsDocument = graphql(`
  mutation ReloadScryfallAssets {
    reloadScryfallAssets {
      status
      message
    }
  }
`)

type Provider = "none" | "s3" | "google_drive"

type FormState = {
  enabled: boolean
  provider: Provider
  cron: string
  s3Endpoint: string
  s3Bucket: string
  s3Region: string
  s3Prefix: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  googleClientId: string
  googleClientSecret: string
  googleRefreshToken: string
  googleFolderId: string
}

const initialForm: FormState = {
  enabled: false,
  provider: "none",
  cron: "0 3 * * *",
  s3Endpoint: "",
  s3Bucket: "",
  s3Region: "auto",
  s3Prefix: "manavault",
  s3AccessKeyId: "",
  s3SecretAccessKey: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRefreshToken: "",
  googleFolderId: "",
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState("")

  const settingsQuery = useQuery({
    queryKey: ["backup-settings"],
    queryFn: () => request(BackupSettingsDocument),
  })

  const settings = settingsQuery.data?.backupSettings
  const backupsQuery = useQuery({
    queryKey: ["cloud-backups", settings?.provider],
    queryFn: () => request(CloudBackupsDocument),
    enabled: !!settings && settings.provider !== "none",
  })

  const backups = backupsQuery.data?.cloudBackups ?? []

  useEffect(() => {
    if (!settings) return

    setForm({
      enabled: settings.enabled,
      provider: providerValue(settings.provider),
      cron: settings.cron,
      s3Endpoint: settings.s3Endpoint ?? "",
      s3Bucket: settings.s3Bucket ?? "",
      s3Region: settings.s3Region ?? "auto",
      s3Prefix: settings.s3Prefix ?? "manavault",
      s3AccessKeyId: settings.s3AccessKeyId ?? "",
      s3SecretAccessKey: "",
      googleClientId: settings.googleClientId ?? "",
      googleClientSecret: "",
      googleRefreshToken: "",
      googleFolderId: settings.googleFolderId ?? "",
    })
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => request(UpdateBackupSettingsDocument, { input: backupSettingsInput(form) }),
    onSuccess: async () => {
      setError(null)
      setMessage("Backup settings saved.")
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const runMutation = useMutation({
    mutationFn: () => request(RunCloudBackupDocument),
    onSuccess: async (data) => {
      setError(null)
      setMessage(data.runCloudBackup?.message ?? "Backup uploaded.")
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => request(StageCloudRestoreDocument, { id }),
    onSuccess: async (data) => {
      setError(null)
      setMessage(data.stageCloudRestore?.message ?? "Restore staged.")
      await queryClient.invalidateQueries({ queryKey: ["backup-settings"] })
      await queryClient.invalidateQueries({ queryKey: ["cloud-backups"] })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const catalogReloadMutation = useMutation({
    mutationFn: () => request(ReloadScryfallCatalogDocument),
    onSuccess: (data) => {
      setError(null)
      setMessage(data.reloadScryfallCatalog?.message ?? "Scryfall catalog reload queued.")
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const assetReloadMutation = useMutation({
    mutationFn: () => request(ReloadScryfallAssetsDocument),
    onSuccess: (data) => {
      setError(null)
      setMessage(data.reloadScryfallAssets?.message ?? "Scryfall asset reload queued.")
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    saveMutation.mutate()
  }

  function runBackup() {
    setMessage(null)
    setError(null)
    runMutation.mutate()
  }

  function stageRestore() {
    if (!restoreId) {
      setError("Choose a cloud backup to restore.")
      return
    }

    setMessage(null)
    setError(null)
    restoreMutation.mutate(restoreId)
  }

  function reloadScryfallCatalog() {
    setMessage(null)
    setError(null)
    catalogReloadMutation.mutate()
  }

  function reloadScryfallAssets() {
    setMessage(null)
    setError(null)
    assetReloadMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage cloud backups, manual restores, and Scryfall catalog maintenance."
      />

      {settingsQuery.isError ? (
        <Alert tone="error">{errorMessage(settingsQuery.error)}</Alert>
      ) : null}
      {backupsQuery.isError ? <Alert tone="error">{errorMessage(backupsQuery.error)}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <form onSubmit={submitSettings} className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="flex items-center gap-3">
            <Cloud className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-black tracking-normal">Provider and schedule</h2>
          </div>

          <label className="flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={form.enabled}
              onChange={(event) => setFormField("enabled", event.target.checked)}
            />
            Enable scheduled cloud backups
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Cloud provider" htmlFor="backup-provider">
              <select
                id="backup-provider"
                className="select select-bordered w-full bg-base-100"
                value={form.provider}
                onChange={(event) => setFormField("provider", providerValue(event.target.value))}
              >
                <option value="none">None</option>
                <option value="s3">S3-compatible bucket</option>
                <option value="google_drive">Google Drive</option>
              </select>
            </Field>

            <Field
              label="CRON schedule"
              htmlFor="backup-cron"
              help="Five-field CRON, evaluated once per minute. Example: 0 3 * * * backs up daily at 03:00 UTC."
            >
              <Input
                id="backup-cron"
                value={form.cron}
                onChange={(event) => setFormField("cron", event.target.value)}
                placeholder="0 3 * * *"
              />
            </Field>
          </div>

          {form.provider === "s3" ? (
            <S3Fields
              form={form}
              setFormField={setFormField}
              hasSecret={settings?.hasS3SecretAccessKey ?? false}
            />
          ) : null}
          {form.provider === "google_drive" ? (
            <GoogleDriveFields form={form} setFormField={setFormField} settings={settings} />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saveMutation.isPending || settingsQuery.isLoading}>
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={runBackup}
              disabled={runMutation.isPending || form.provider === "none"}
            >
              <DatabaseBackup className="h-4 w-4" />
              {runMutation.isPending ? "Uploading..." : "Back up now"}
            </Button>
          </div>

          <StatusSummary settings={settings} />
        </div>
      </form>

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
              <Button
                type="button"
                onClick={reloadScryfallCatalog}
                disabled={catalogReloadMutation.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                {catalogReloadMutation.isPending ? "Queueing..." : "Reload Scryfall catalog"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reloadScryfallAssets}
                disabled={assetReloadMutation.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                {assetReloadMutation.isPending ? "Queueing..." : "Reload symbols and set icons"}
              </Button>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection title="Restore from cloud" count={`${backups.length} backups`}>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4 p-6">
            <p className="text-base-content/70">
              Restore downloads the selected cloud backup and stages it locally. Restart ManaVault
              to replace the SQLite database before the app starts.
            </p>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                className="select select-bordered w-full bg-base-100"
                value={restoreId}
                onChange={(event) => setRestoreId(event.target.value)}
                disabled={backups.length === 0}
              >
                <option value="">Choose backup</option>
                {backups.map((backup) => (
                  <option key={backup.id} value={backup.id}>
                    {backup.name} {backup.modifiedAt ? `(${formatDate(backup.modifiedAt)})` : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="destructive"
                onClick={stageRestore}
                disabled={restoreMutation.isPending || !restoreId}
              >
                <DownloadCloud className="h-4 w-4" />
                {restoreMutation.isPending ? "Staging..." : "Stage restore"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-fit"
              onClick={() => backupsQuery.refetch()}
              disabled={backupsQuery.isFetching || form.provider === "none"}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh cloud list
            </Button>
          </div>
        </div>
      </PageSection>
    </div>
  )

  function setFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }
}

function S3Fields({
  form,
  setFormField,
  hasSecret,
}: {
  form: FormState
  setFormField: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  hasSecret: boolean
}) {
  return (
    <div className="grid gap-4 rounded-box border border-base-300 bg-base-200/50 p-4 md:grid-cols-2">
      <Field
        label="Endpoint"
        htmlFor="s3-endpoint"
        help="R2 example: https://<account>.r2.cloudflarestorage.com"
      >
        <Input
          id="s3-endpoint"
          value={form.s3Endpoint}
          onChange={(event) => setFormField("s3Endpoint", event.target.value)}
          placeholder="https://..."
        />
      </Field>
      <Field label="Bucket" htmlFor="s3-bucket">
        <Input
          id="s3-bucket"
          value={form.s3Bucket}
          onChange={(event) => setFormField("s3Bucket", event.target.value)}
        />
      </Field>
      <Field label="Region" htmlFor="s3-region" help="Use auto for Cloudflare R2.">
        <Input
          id="s3-region"
          value={form.s3Region}
          onChange={(event) => setFormField("s3Region", event.target.value)}
        />
      </Field>
      <Field label="Prefix" htmlFor="s3-prefix">
        <Input
          id="s3-prefix"
          value={form.s3Prefix}
          onChange={(event) => setFormField("s3Prefix", event.target.value)}
          placeholder="manavault"
        />
      </Field>
      <Field label="Access key ID" htmlFor="s3-access-key">
        <Input
          id="s3-access-key"
          value={form.s3AccessKeyId}
          onChange={(event) => setFormField("s3AccessKeyId", event.target.value)}
        />
      </Field>
      <Field
        label="Secret access key"
        htmlFor="s3-secret"
        help={hasSecret ? "Leave blank to keep the saved secret." : undefined}
      >
        <Input
          id="s3-secret"
          type="password"
          value={form.s3SecretAccessKey}
          onChange={(event) => setFormField("s3SecretAccessKey", event.target.value)}
          placeholder={hasSecret ? "Saved" : ""}
        />
      </Field>
    </div>
  )
}

function GoogleDriveFields({
  form,
  setFormField,
  settings,
}: {
  form: FormState
  setFormField: <K extends keyof FormState>(field: K, value: FormState[K]) => void
  settings?: {
    hasGoogleClientSecret?: boolean | null
    hasGoogleRefreshToken?: boolean | null
  } | null
}) {
  return (
    <div className="grid gap-4 rounded-box border border-base-300 bg-base-200/50 p-4 md:grid-cols-2">
      <Field label="OAuth client ID" htmlFor="google-client-id">
        <Input
          id="google-client-id"
          value={form.googleClientId}
          onChange={(event) => setFormField("googleClientId", event.target.value)}
        />
      </Field>
      <Field
        label="OAuth client secret"
        htmlFor="google-client-secret"
        help={settings?.hasGoogleClientSecret ? "Leave blank to keep the saved secret." : undefined}
      >
        <Input
          id="google-client-secret"
          type="password"
          value={form.googleClientSecret}
          onChange={(event) => setFormField("googleClientSecret", event.target.value)}
          placeholder={settings?.hasGoogleClientSecret ? "Saved" : ""}
        />
      </Field>
      <Field
        label="Refresh token"
        htmlFor="google-refresh-token"
        help={
          settings?.hasGoogleRefreshToken
            ? "Leave blank to keep the saved token."
            : "Use a token with Google Drive file access."
        }
      >
        <Input
          id="google-refresh-token"
          type="password"
          value={form.googleRefreshToken}
          onChange={(event) => setFormField("googleRefreshToken", event.target.value)}
          placeholder={settings?.hasGoogleRefreshToken ? "Saved" : ""}
        />
      </Field>
      <Field
        label="Folder ID"
        htmlFor="google-folder-id"
        help="Optional. Backups go to My Drive if blank."
      >
        <Input
          id="google-folder-id"
          value={form.googleFolderId}
          onChange={(event) => setFormField("googleFolderId", event.target.value)}
        />
      </Field>
    </div>
  )
}

function StatusSummary({
  settings,
}: {
  settings:
    | {
        lastBackupAt?: string | null
        lastBackupStatus?: string | null
        lastBackupMessage?: string | null
        lastRestoreAt?: string | null
        lastRestoreStatus?: string | null
        lastRestoreMessage?: string | null
      }
    | null
    | undefined
}) {
  if (!settings) return null

  return (
    <div className="grid gap-3 border-t border-base-300 pt-4 text-sm md:grid-cols-2">
      <StatusLine
        label="Last backup"
        at={settings.lastBackupAt}
        status={settings.lastBackupStatus}
        message={settings.lastBackupMessage}
      />
      <StatusLine
        label="Last restore"
        at={settings.lastRestoreAt}
        status={settings.lastRestoreStatus}
        message={settings.lastRestoreMessage}
      />
    </div>
  )
}

function StatusLine({
  label,
  at,
  status,
  message,
}: {
  label: string
  at?: string | null
  status?: string | null
  message?: string | null
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/40 p-3">
      <div className="font-bold">{label}</div>
      <div className="text-base-content/70">
        {status ? `${status}${at ? ` · ${formatDate(at)}` : ""}` : "No activity yet"}
      </div>
      {message ? <div className="mt-1 text-base-content/70">{message}</div> : null}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string
  htmlFor: string
  help?: string
  children: ReactNode
}) {
  return (
    <label className="fieldset p-0" htmlFor={htmlFor}>
      <span className="fieldset-label text-sm font-bold text-base-content">{label}</span>
      {children}
      {help ? <span className="fieldset-label text-xs text-base-content/60">{help}</span> : null}
    </label>
  )
}

function Alert({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div className={`alert ${tone === "success" ? "alert-success" : "alert-error"}`}>
      {children}
    </div>
  )
}

function backupSettingsInput(form: FormState) {
  return dropEmptySecrets({
    enabled: form.enabled,
    provider: form.provider,
    cron: form.cron,
    s3Endpoint: form.s3Endpoint,
    s3Bucket: form.s3Bucket,
    s3Region: form.s3Region,
    s3Prefix: form.s3Prefix,
    s3AccessKeyId: form.s3AccessKeyId,
    s3SecretAccessKey: form.s3SecretAccessKey,
    googleClientId: form.googleClientId,
    googleClientSecret: form.googleClientSecret,
    googleRefreshToken: form.googleRefreshToken,
    googleFolderId: form.googleFolderId,
  })
}

function dropEmptySecrets(input: Record<string, unknown>) {
  for (const key of ["s3SecretAccessKey", "googleClientSecret", "googleRefreshToken"]) {
    if (typeof input[key] === "string" && input[key].trim() === "") delete input[key]
  }
  return input
}

function providerValue(value: string): Provider {
  if (value === "s3" || value === "google_drive") return value
  return "none"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  )
}
