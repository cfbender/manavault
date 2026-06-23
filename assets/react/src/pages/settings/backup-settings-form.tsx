import { Cloud, DatabaseBackup, Save } from "lucide-react"
import type { FormEvent } from "react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { type FormState, providerValue } from "./data"
import { Field, StatusSummary } from "./ui"

export function BackupSettingsForm({
  form,
  settings,
  savePending,
  settingsLoading,
  runPending,
  onSubmit,
  onRunBackup,
  setFormField,
}: {
  form: FormState
  settings:
    | {
        hasS3SecretAccessKey?: boolean | null
        hasGoogleClientSecret?: boolean | null
        hasGoogleRefreshToken?: boolean | null
        lastBackupAt?: string | null
        lastBackupStatus?: string | null
        lastBackupMessage?: string | null
        lastRestoreAt?: string | null
        lastRestoreStatus?: string | null
        lastRestoreMessage?: string | null
      }
    | null
    | undefined
  savePending: boolean
  settingsLoading: boolean
  runPending: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRunBackup: () => void
  setFormField: <K extends keyof FormState>(field: K, value: FormState[K]) => void
}) {
  return (
    <form onSubmit={onSubmit} className="card border border-base-300 bg-base-100 shadow-sm">
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
          <Button type="submit" disabled={savePending || settingsLoading}>
            <Save className="h-4 w-4" />
            {savePending ? "Saving..." : "Save settings"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRunBackup}
            disabled={runPending || form.provider === "none"}
          >
            <DatabaseBackup className="h-4 w-4" />
            {runPending ? "Uploading..." : "Back up now"}
          </Button>
        </div>

        <StatusSummary settings={settings} />
      </div>
    </form>
  )
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
