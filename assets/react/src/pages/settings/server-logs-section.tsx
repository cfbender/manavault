import { useSubscription } from "@apollo/client/react"
import { Activity, Trash2 } from "lucide-react"
import { useState } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import type { ServerLogSubscription } from "../../gql/graphql"
import { ServerLogDocument } from "./data"

const MAX_LOGS = 200

type ServerLog = ServerLogSubscription["serverLog"]

export function addServerLog(logs: ServerLog[], log: ServerLog) {
  return [log, ...logs].slice(0, MAX_LOGS)
}

export function ServerLogsSection() {
  const [logs, setLogs] = useState<ServerLog[]>([])
  const subscription = useSubscription(ServerLogDocument, {
    onData({ data }) {
      const log = data.data?.serverLog
      if (log) setLogs((current) => addServerLog(current, log))
    },
  })

  const connectionLabel = subscription.error
    ? "Disconnected"
    : subscription.loading
      ? "Connecting"
      : "Live"

  return (
    <PageSection title="Server logs" count={`${connectionLabel} · ${logs.length}/${MAX_LOGS}`}>
      <div className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 bg-base-200/40 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Activity className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-black">Live application output</h2>
              <p className="text-sm text-base-content/60">
                Newest first. Events are kept in this browser only.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold" aria-live="polite">
              <span
                className={`h-2 w-2 rounded-full ${subscription.error ? "bg-error" : "bg-success"}`}
                aria-hidden="true"
              />
              {connectionLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-8"
              disabled={logs.length === 0}
              onClick={() => setLogs([])}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        {subscription.error ? (
          <div className="border-b border-base-300 bg-error/10 px-4 py-3 text-sm text-error sm:px-6">
            Live logs are unavailable. The connection will retry automatically.
          </div>
        ) : null}

        <div className="max-h-[32rem] overflow-auto" role="log" aria-label="Server log events">
          {logs.length === 0 ? (
            <div className="px-4 py-12 text-center sm:px-6">
              <p className="font-bold">Waiting for server activity</p>
              <p className="mt-1 text-sm text-base-content/60">
                New log events will appear here while this page is open.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-base-300 font-mono text-xs">
              {logs.map((entry) => (
                <li
                  key={entry.id}
                  className="grid min-w-0 gap-1 px-4 py-3 sm:grid-cols-[8.5rem_5rem_minmax(0,1fr)] sm:gap-3 sm:px-6"
                >
                  <time className="text-base-content/55" dateTime={entry.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                  </time>
                  <span className={`font-bold uppercase ${levelClass(entry.level)}`}>
                    {entry.level}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-base-content">
                    {entry.message}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </PageSection>
  )
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp))
}

function levelClass(level: string) {
  switch (level) {
    case "error":
      return "text-error"
    case "warning":
      return "text-warning"
    case "info":
      return "text-info"
    default:
      return "text-base-content/65"
  }
}
