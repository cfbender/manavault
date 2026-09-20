import { useMutation, useQuery } from "@apollo/client/react"
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import {
  ApiKeysDocument,
  CreateApiKeyDocument,
  RevokeApiKeyDocument,
  errorMessage,
  formatDate,
} from "./data"

export function ApiKeysSection() {
  const { showToast } = useToast()
  const [name, setName] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null)
  const apiKeysQuery = useQuery(ApiKeysDocument, { fetchPolicy: "cache-and-network" })
  const [createApiKey, createMutation] = useMutation(CreateApiKeyDocument)
  const [revokeApiKey, revokeMutation] = useMutation(RevokeApiKeyDocument)
  const apiKeys = apiKeysQuery.data?.apiKeys ?? []

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    void createApiKey({
      variables: { name: trimmedName },
      onCompleted: (data) => {
        setCreatedToken(data.createApiKey.token)
        setCopyState("idle")
        setName("")
        void apiKeysQuery.refetch()
      },
      onError: (error) => showToast(errorMessage(error)),
    })
  }

  async function copyToken() {
    if (!createdToken) return

    try {
      await navigator.clipboard.writeText(createdToken)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  function revoke(id: string) {
    if (pendingRevokeId !== id) {
      setPendingRevokeId(id)
      return
    }

    void revokeApiKey({
      variables: { id },
      onCompleted: () => {
        setPendingRevokeId(null)
        showToast("API key revoked.")
        void apiKeysQuery.refetch()
      },
      onError: (error) => showToast(errorMessage(error)),
    })
  }

  return (
    <PageSection title="API Keys" count={`${apiKeys.length} active`}>
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Personal API keys</h2>
              <p className="mt-1 max-w-3xl text-sm text-base-content/60">
                Connect The Gathering or another trusted application to your decks. Keys are
                read-only and grant access to every deck in this ManaVault instance.
              </p>
            </div>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={create}>
            <label className="grid flex-1 gap-1" htmlFor="api-key-name">
              <span className="text-sm font-bold">Key name</span>
              <Input
                id="api-key-name"
                value={name}
                maxLength={80}
                placeholder="The Gathering"
                disabled={createMutation.loading}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={createMutation.loading || !name.trim()}>
              <Plus className="h-4 w-4" />
              {createMutation.loading ? "Creating..." : "Create key"}
            </Button>
          </form>

          {createdToken ? (
            <div className="rounded-box border border-warning/40 bg-warning/10 p-4" role="status">
              <div className="font-bold">Copy this key now</div>
              <p className="mt-1 text-sm text-base-content/70">
                This is the only time ManaVault will show the full key. Store it securely.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-btn bg-base-100 px-3 py-2 font-mono text-sm">
                  {createdToken}
                </code>
                <Button type="button" variant="outline" onClick={() => void copyToken()}>
                  {copyState === "copied" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "failed"
                      ? "Copy failed"
                      : "Copy key"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCreatedToken(null)}>
                  I saved it
                </Button>
              </div>
            </div>
          ) : null}

          {apiKeysQuery.error ? (
            <p className="text-sm text-error">{errorMessage(apiKeysQuery.error)}</p>
          ) : apiKeysQuery.loading && apiKeys.length === 0 ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              Loading API keys...
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              No API keys yet. Create one when you are ready to connect another application.
            </div>
          ) : (
            <ul className="divide-y divide-base-300 border-y border-base-300">
              {apiKeys.map((apiKey) => (
                <li
                  key={apiKey.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-bold">{apiKey.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/60">
                      <code className="font-mono">{apiKey.prefix}…</code>
                      <span>Created {formatDate(apiKey.createdAt)}</span>
                      <span>
                        {apiKey.lastUsedAt
                          ? `Last used ${formatDate(apiKey.lastUsedAt)}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingRevokeId === apiKey.id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingRevokeId(null)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={revokeMutation.loading}
                      onClick={() => revoke(apiKey.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {pendingRevokeId === apiKey.id ? "Confirm revoke" : "Revoke"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageSection>
  )
}
