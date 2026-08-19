import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Bot, Save } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../components/ui/toast"
import { AISettingsDocument, UpdateAISettingsDocument, errorMessage } from "./data"
import { Field } from "./ui"

export function AISettingsSection() {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [provider, setProvider] = useState("openrouter")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [deckAnalysisInstructions, setDeckAnalysisInstructions] = useState("")
  const settingsQuery = useQuery(AISettingsDocument, { fetchPolicy: "cache-and-network" })
  const [updateSettings, updateMutation] = useMutation(UpdateAISettingsDocument)
  const settings = settingsQuery.data?.aiSettings

  useEffect(() => {
    if (!settings) return
    setProvider(settings.provider)
    setModel(settings.model ?? "")
    setDeckAnalysisInstructions(settings.deckAnalysisInstructions ?? "")
    setApiKey("")
  }, [settings])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    void updateSettings({
      variables: {
        input: {
          provider,
          model,
          deckAnalysisInstructions,
          ...(apiKey.trim() ? { apiKey } : {}),
        },
      },
      onCompleted: (data) => {
        const nextSettings = data.updateAiSettings?.aiSettings
        setApiKey("")
        if (nextSettings) {
          client.writeQuery({ query: AISettingsDocument, data: { aiSettings: nextSettings } })
        }
        showToast("AI settings validated and saved.")
      },
      onError: (error) => showToast(errorMessage(error), { tone: "error" }),
    })
  }

  return (
    <PageSection title="AI analysis" count="Provider settings">
      <form onSubmit={submit} className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Deck analysis provider</h2>
              <p className="mt-1 max-w-[72ch] text-sm text-base-content/60">
                ManaVault sends a decklist to the selected provider only when you choose Analyze
                deck. Saving validates both the API key and model ID.
              </p>
            </div>
          </div>

          {settingsQuery.error ? (
            <p className="text-sm text-error" role="alert">
              {errorMessage(settingsQuery.error)}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider" htmlFor="ai-provider">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="ai-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Model ID"
              htmlFor="ai-model"
              help="Use an OpenRouter model ID, such as anthropic/claude-sonnet-4."
            >
              <Input
                id="ai-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="provider/model-name"
                autoComplete="off"
                required
              />
            </Field>

            <Field
              label="OpenRouter API key"
              htmlFor="ai-api-key"
              help={settings?.hasApiKey ? "Leave blank to keep the saved key." : undefined}
            >
              <Input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings?.hasApiKey ? "Saved" : "sk-or-v1-…"}
                autoComplete="new-password"
                required={!settings?.hasApiKey}
              />
            </Field>
          </div>

          <div className="border-t border-base-300 pt-5">
            <h3 className="text-lg font-black">Deck analysis instructions</h3>
            <p className="mt-1 max-w-[72ch] text-sm text-base-content/60">
              Tailor every deck analysis to your preferences. You can rule out recommendations or
              request extra sections such as budget upgrades.
            </p>
            <div className="mt-4">
              <Field
                label="Custom instructions"
                htmlFor="ai-deck-analysis-instructions"
                help="Applied only when analyzing a deck. Maximum 4,000 characters."
              >
                <Textarea
                  id="ai-deck-analysis-instructions"
                  value={deckAnalysisInstructions}
                  onChange={(event) => setDeckAnalysisInstructions(event.target.value)}
                  placeholder={"For example: “Never suggest infinite combos.”"}
                  rows={6}
                  maxLength={4000}
                />
              </Field>
            </div>
          </div>

          <div>
            <Button type="submit" disabled={settingsQuery.loading || updateMutation.loading}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {updateMutation.loading ? "Validating..." : "Validate and save"}
            </Button>
          </div>
        </div>
      </form>
    </PageSection>
  )
}
