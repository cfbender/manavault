import type { ReactNode } from "react"
import { formatDate } from "./data"

export function StatusSummary({
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

export function StatusLine({
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

export function Field({
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

export function Alert({
  tone,
  children,
}: {
  tone: "success" | "error" | "warning"
  children: ReactNode
}) {
  const toneClass =
    tone === "success" ? "alert-success" : tone === "warning" ? "alert-warning" : "alert-error"

  return <div className={`alert ${toneClass}`}>{children}</div>
}
