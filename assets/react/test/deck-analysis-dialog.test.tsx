import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

type AnalysisRequest = {
  id: string
  sourceType: string
  source: string
  sourceName: string
  format: string
  analysis: string
  model: string
  commanderBracket: number | null
  commanderBracketEstimate: number | null
  insertedAt: string
}

const apolloMocks = vi.hoisted(() => ({
  analyzeVariables: null as {
    format: string
    text?: string
    url?: string
  } | null,
  historyData: {
    deckAnalysisRequests: [
      {
        id: "analysis-1",
        sourceType: "url",
        source: "https://moxfield.com/decks/abcde",
        sourceName: "Weekend counters",
        format: "commander",
        analysis: "## Overview\n\nBuild value, then turn the corner with [[Sun Titan]].",
        model: "anthropic/claude-sonnet-4",
        commanderBracket: 3,
        commanderBracketEstimate: 2,
        insertedAt: "2026-08-30T12:00:00Z",
      },
    ] satisfies AnalysisRequest[],
  },
  refetch: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useQuery: () => ({
    data: apolloMocks.historyData,
    error: undefined,
    loading: false,
    refetch: apolloMocks.refetch,
  }),
  useMutation: () => [
    (options: {
      variables: { format: string; text?: string; url?: string }
      onCompleted?: (data: { analyzeDeckList: { deckAnalysisRequest: AnalysisRequest } }) => void
    }) => {
      apolloMocks.analyzeVariables = options.variables
      options.onCompleted?.({
        analyzeDeckList: {
          deckAnalysisRequest: {
            id: "analysis-2",
            sourceType: options.variables.text ? "text" : "url",
            source: options.variables.text || options.variables.url || "",
            sourceName: "Pasted decklist",
            format: options.variables.format,
            analysis: "## Overview\n\nA focused one-time analysis.",
            model: "anthropic/claude-sonnet-4",
            commanderBracket: null,
            commanderBracketEstimate: null,
            insertedAt: "2026-08-30T13:00:00Z",
          },
        },
      })
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
}))

import { DeckAnalysisDialog } from "../src/pages/decks/deck-analysis-dialog"

afterEach(() => {
  cleanup()
  apolloMocks.analyzeVariables = null
  apolloMocks.refetch.mockClear()
})

test("renders saved one-time analyses newest first", () => {
  render(<DeckAnalysisDialog open onOpenChange={() => undefined} />)

  const dialog = screen.getByRole("dialog", { name: "Analyze a deck list" })
  const entries = dialog.querySelectorAll("details")

  expect(dialog.getAttribute("aria-describedby")).toBe("deck-list-analysis-description")
  expect(screen.getByRole("heading", { name: "Saved analyses" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText("1 saved")).toBeInstanceOf(HTMLElement)
  expect(entries).toHaveLength(1)
  expect(entries[0]?.open).toBe(true)
  expect(entries[0]?.textContent).toContain("Weekend counters")
  expect(entries[0]?.textContent).toContain("Bracket 3 · plays like 2")
  expect(screen.getByRole("heading", { name: "Overview" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("link", { name: "Sun Titan" }).getAttribute("href")).toBe(
    "/cards?q=Sun%20Titan",
  )
  expect(screen.getByRole("link", { name: /Open source decklist/ }).getAttribute("href")).toBe(
    "https://moxfield.com/decks/abcde",
  )
})

test("submits a trimmed pasted list and adds the saved result to history", async () => {
  const user = userEvent.setup()
  render(<DeckAnalysisDialog open onOpenChange={() => undefined} />)

  await user.click(screen.getByRole("button", { name: "Paste list" }))
  const decklist = screen.getByRole("textbox", { name: /Decklist text/ })
  await user.type(decklist, "  Mainboard\n1 Sol Ring  ")
  await user.click(screen.getByRole("button", { name: "Analyze decklist" }))

  expect(apolloMocks.analyzeVariables).toEqual({
    format: "commander",
    text: "Mainboard\n1 Sol Ring",
    url: undefined,
  })
  expect((decklist as HTMLTextAreaElement).value).toBe("")
  expect(screen.getByText("2 saved")).toBeInstanceOf(HTMLElement)

  const entries = screen
    .getByRole("dialog", { name: "Analyze a deck list" })
    .querySelectorAll("details")
  expect(entries).toHaveLength(2)
  expect(entries[0]?.open).toBe(true)
  expect(entries[0]?.textContent).toContain("Pasted decklist")
  expect(entries[0]?.textContent).toContain("A focused one-time analysis.")
})
