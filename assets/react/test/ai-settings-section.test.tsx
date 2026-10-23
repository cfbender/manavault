import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { AISettingsSection } from "../src/pages/settings/ai-settings-section"
import {
  AIModelReasoningDocument,
  AISettingsDocument,
  RefreshAllDeckAnalysesDocument,
  UpdateAISettingsDocument,
} from "../src/pages/settings/data"

afterEach(cleanup)

function reasoningMock(
  model: string,
  aiModelReasoning: { supportedEfforts: string[]; defaultEffort: string | null } | null,
) {
  return {
    request: { query: AIModelReasoningDocument, variables: { model } },
    result: { data: { aiModelReasoning } },
    maxUsageCount: Number.POSITIVE_INFINITY,
  }
}

test("loads and saves custom deck analysis instructions", async () => {
  const existingInstructions = "Never suggest infinite combos."
  const updatedInstructions = `${existingInstructions} Add a budget upgrades section.`
  const settings = {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    deckAnalysisInstructions: existingInstructions,
    decisionModel: "typesafe/jev-1.13",
    reasoningEffort: null,
    hasApiKey: true,
  }
  const updatedSettings = {
    ...settings,
    deckAnalysisInstructions: updatedInstructions,
    decisionModel: "custom/decider",
  }
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
            decisionModel: "custom/decider",
            reasoningEffort: null,
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
  const decisionModel = screen.getByRole("textbox", { name: /Decision model ID/ })
  expect((decisionModel as HTMLInputElement).value).toBe("typesafe/jev-1.13")
  await userEvent.clear(decisionModel)
  await userEvent.type(decisionModel, "custom/decider")
  await userEvent.click(screen.getByRole("button", { name: "Validate and save" }))

  expect(await screen.findByText("AI settings validated and saved.")).toBeTruthy()
  expect((instructions as HTMLTextAreaElement).value).toBe(updatedInstructions)
})

test("preserves dirty form values when settings refetch", async () => {
  const initialSettings = {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    deckAnalysisInstructions: "Initial instructions",
    decisionModel: "typesafe/jev-1.13",
    reasoningEffort: null,
    hasApiKey: true,
  }
  const refetchedSettings = {
    ...initialSettings,
    model: "openai/gpt-5",
    deckAnalysisInstructions: "Refetched instructions",
  }
  const link = new MockLink([
    {
      request: { query: AISettingsDocument },
      result: { data: { aiSettings: initialSettings } },
    },
    {
      request: { query: AISettingsDocument },
      result: { data: { aiSettings: refetchedSettings } },
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

  const model = await screen.findByRole("textbox", { name: /Model ID/ })
  const instructions = screen.getByRole("textbox", { name: /Custom instructions/ })
  await userEvent.clear(model)
  await userEvent.type(model, "google/gemini-2.5-pro")
  await userEvent.clear(instructions)
  await userEvent.type(instructions, "Keep my unsaved instructions")

  await client.refetchQueries({ include: [AISettingsDocument] })

  expect((model as HTMLInputElement).value).toBe("google/gemini-2.5-pro")
  expect((instructions as HTMLTextAreaElement).value).toBe("Keep my unsaved instructions")
})

test("queues a refresh for every deck analysis", async () => {
  const settings = {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    deckAnalysisInstructions: "",
    decisionModel: "typesafe/jev-1.13",
    reasoningEffort: null,
    hasApiKey: true,
  }
  const link = new MockLink([
    {
      request: { query: AISettingsDocument },
      result: { data: { aiSettings: settings } },
    },
    {
      request: { query: RefreshAllDeckAnalysesDocument },
      delay: 100,
      result: { data: { refreshAllDeckAnalyses: { queuedCount: 3 } } },
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

  const refresh = await screen.findByRole("button", { name: "Refresh all deck analyses" })
  await waitFor(() => expect(refresh.hasAttribute("disabled")).toBe(false))
  await userEvent.click(refresh)

  expect(screen.getByRole("button", { name: "Queueing..." }).hasAttribute("disabled")).toBe(true)
  expect(await screen.findByText("Queued AI analysis refresh for 3 decks.")).toBeTruthy()
})

test("offers the reasoning efforts the model supports and drops ones the next model lacks", async () => {
  const settings = {
    provider: "openrouter",
    model: "openai/gpt-6.1-sol",
    deckAnalysisInstructions: "",
    decisionModel: "typesafe/jev-1.13",
    reasoningEffort: "xhigh",
    hasApiKey: true,
  }
  const save = (model: string, reasoningEffort: string | null) => ({
    request: {
      query: UpdateAISettingsDocument,
      variables: {
        input: {
          provider: "openrouter",
          model,
          deckAnalysisInstructions: "",
          decisionModel: "typesafe/jev-1.13",
          reasoningEffort,
        },
      },
    },
    result: { data: { updateAiSettings: { aiSettings: { ...settings, model, reasoningEffort } } } },
  })
  const link = new MockLink([
    { request: { query: AISettingsDocument }, result: { data: { aiSettings: settings } } },
    reasoningMock("openai/gpt-6.1-sol", {
      supportedEfforts: ["max", "xhigh", "high", "medium", "low"],
      defaultEffort: "medium",
    }),
    reasoningMock("google/gemini-4-argon", {
      supportedEfforts: ["high", "medium", "low"],
      defaultEffort: "medium",
    }),
    save("openai/gpt-6.1-sol", "low"),
    save("google/gemini-4-argon", null),
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  const user = userEvent.setup()

  render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <AISettingsSection />
      </ToastProvider>
    </ApolloProvider>,
  )

  const effort = await screen.findByRole("combobox", { name: /Reasoning effort/ })
  expect(effort.textContent).toBe("Extra high")
  await waitFor(() => expect(effort.hasAttribute("disabled")).toBe(false))
  await user.click(effort)
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "Model default (Medium)",
    "Max",
    "Extra high",
    "High",
    "Medium",
    "Low",
  ])
  await user.click(screen.getByRole("option", { name: "Low" }))
  await user.click(screen.getByRole("button", { name: "Validate and save" }))
  expect(await screen.findByText("AI settings validated and saved.")).toBeTruthy()

  // The next model does not offer Max, so the form falls back to its default.
  await user.click(effort)
  await user.click(screen.getByRole("option", { name: "Max" }))
  const model = screen.getByRole("textbox", { name: /Model ID/ })
  await user.clear(model)
  await user.type(model, "google/gemini-4-argon")
  await waitFor(() => expect(effort.textContent).toBe("Model default (Medium)"))
  await user.click(screen.getByRole("button", { name: "Validate and save" }))
  await waitFor(() =>
    expect(screen.getAllByText("AI settings validated and saved.").length).toBeGreaterThan(1),
  )
})
