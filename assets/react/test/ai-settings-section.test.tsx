import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { AISettingsSection } from "../src/pages/settings/ai-settings-section"
import { AISettingsDocument, UpdateAISettingsDocument } from "../src/pages/settings/data"

afterEach(cleanup)

test("loads and saves custom deck analysis instructions", async () => {
  const existingInstructions = "Never suggest infinite combos."
  const updatedInstructions = `${existingInstructions} Add a budget upgrades section.`
  const settings = {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    deckAnalysisInstructions: existingInstructions,
    hasApiKey: true,
  }
  const updatedSettings = { ...settings, deckAnalysisInstructions: updatedInstructions }
  const link = new MockLink([
    {
      request: { query: AISettingsDocument },
      result: { data: { aiSettings: settings } },
    },
    {
      request: {
        query: UpdateAISettingsDocument,
        variables: {
          input: {
            provider: "openrouter",
            model: "anthropic/claude-sonnet-4",
            deckAnalysisInstructions: updatedInstructions,
          },
        },
      },
      result: { data: { updateAiSettings: { aiSettings: updatedSettings } } },
    },
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })

  render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <AISettingsSection />
      </ToastProvider>
    </ApolloProvider>,
  )

  const instructions = await screen.findByRole("textbox", { name: /Custom instructions/ })
  expect((instructions as HTMLTextAreaElement).value).toBe(existingInstructions)
  expect(instructions.getAttribute("maxlength")).toBe("4000")

  await userEvent.type(instructions, " Add a budget upgrades section.")
  await userEvent.click(screen.getByRole("button", { name: "Validate and save" }))

  expect(await screen.findByText("AI settings validated and saved.")).toBeTruthy()
  expect((instructions as HTMLTextAreaElement).value).toBe(updatedInstructions)
})
