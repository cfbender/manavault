import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

type CardMatch = {
  id: string
  name: string
  printings: { edges: { node: { id: string; imageUrl: string | null } }[] }
}

const apolloMocks = vi.hoisted(() => ({
  cards: {
    "Sun Titan": {
      id: "card-sun-titan",
      name: "Sun Titan",
      printings: {
        edges: [{ node: { id: "printing-sun-titan", imageUrl: "/images/sun-titan.jpg" } }],
      },
    },
  } as Record<string, CardMatch | null>,
  query: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ query: apolloMocks.query }),
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: apolloMocks.showToast }),
}))

vi.mock("../src/pages/decks/deck-card-detail-dialog", () => ({
  CardDetailDialog: ({
    card,
    graphqlEndpoint,
    hidePrivateControls,
    onOpenChange,
  }: {
    card: { id: string; name: string } | null
    graphqlEndpoint?: string
    hidePrivateControls?: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    card ? (
      <div
        role="dialog"
        aria-label={card.name}
        data-card-id={card.id}
        data-endpoint={graphqlEndpoint ?? ""}
        data-private-hidden={String(Boolean(hidePrivateControls))}
      >
        <button type="button" onClick={() => onOpenChange(false)}>
          Close card
        </button>
      </div>
    ) : null,
}))

import { SummaryActionMenu } from "../src/pages/decks/deck-actions"
import { DeckAIAnalysis } from "../src/pages/decks/deck-ai-analysis"
import type { DeckDetail } from "../src/pages/decks/deck-types"

beforeEach(() => {
  apolloMocks.query.mockReset()
  apolloMocks.showToast.mockReset()
  apolloMocks.query.mockImplementation(
    async ({ variables }: { variables: { name: string }; context?: { uri?: string } }) => ({
      data: { cardByName: apolloMocks.cards[variables.name] ?? null },
    }),
  )
})

afterEach(cleanup)

function deck(attrs: Partial<DeckDetail> = {}) {
  return {
    id: "deck-1",
    aiAnalysis: "## Overview\n\nBuild value, then turn the corner.",
    aiAnalysisModel: "test/model",
    aiAnalyzedAt: "2026-08-19T02:09:23Z",
    commanderBracket: 3,
    commanderBracketEstimate: 2,
    ...attrs,
  } as DeckDetail
}

test("saved AI analysis is collapsed by default", () => {
  const { container } = render(<DeckAIAnalysis deck={deck()} />)

  const disclosure = container.querySelector("details")
  expect(disclosure).toBeInstanceOf(HTMLDetailsElement)
  expect(disclosure?.open).toBe(false)

  fireEvent.click(container.querySelector("summary") as HTMLElement)
  expect(disclosure?.open).toBe(true)
  expect(screen.getByRole("heading", { name: "Overview" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/test\/model · Analyzed/)).toBeInstanceOf(HTMLElement)
  expect(container.querySelector("summary")?.textContent).not.toContain("test/model")
  expect(screen.queryByRole("button", { name: /refresh ai analysis/i })).toBeNull()
  expect(screen.queryByRole("button", { name: /ask ai about this deck/i })).toBeNull()
})

test("card reference previews show the catalog image, or say a card is unknown", async () => {
  const user = userEvent.setup()
  const { container } = render(
    <DeckAIAnalysis
      deck={deck({
        aiAnalysis: "## Overview\n\nRecur [[Sun Titan]] with [[Emeria, the Sky Ruin]].",
      })}
    />,
  )

  await user.click(container.querySelector("summary") as HTMLElement)
  const titan = screen.getByRole("button", { name: "Sun Titan" })
  const emeria = screen.getByRole("button", { name: "Emeria, the Sky Ruin" })
  expect(screen.queryByRole("link", { name: "Sun Titan" })).toBeNull()

  await user.hover(titan)
  const preview = await screen.findByRole("img", { name: "Sun Titan card preview" })
  expect(preview.getAttribute("src")).toBe("/images/sun-titan.jpg")
  expect(screen.getByText("Click to view card details")).toBeInstanceOf(HTMLElement)
  await user.unhover(titan)

  // Emeria is not in the mocked catalog.
  fireEvent.focus(emeria)
  expect(await screen.findByText("Card preview unavailable")).toBeInstanceOf(HTMLElement)
  expect(screen.queryByRole("img", { name: "Emeria, the Sky Ruin card preview" })).toBeNull()
})

test("clicking a card reference resolves the catalog card and opens the card dialog", async () => {
  const user = userEvent.setup()
  const { container } = render(
    <DeckAIAnalysis deck={deck({ aiAnalysis: "Recur [[Sun Titan]] every turn." })} />,
  )

  await user.click(container.querySelector("summary") as HTMLElement)
  await user.click(screen.getByRole("button", { name: "Sun Titan" }))

  const dialog = await screen.findByRole("dialog", { name: "Sun Titan" })
  expect(dialog.getAttribute("data-card-id")).toBe("card-sun-titan")
  expect(dialog.getAttribute("data-endpoint")).toBe("")
  expect(dialog.getAttribute("data-private-hidden")).toBe("false")
  expect(apolloMocks.query).toHaveBeenCalledOnce()
  expect(apolloMocks.query.mock.calls[0]?.[0]).toMatchObject({
    variables: { name: "Sun Titan" },
    context: undefined,
  })
  expect(apolloMocks.showToast).not.toHaveBeenCalled()

  await user.click(screen.getByRole("button", { name: "Close card" }))
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("card references on shared decks use the public share endpoint", async () => {
  const user = userEvent.setup()
  const { container } = render(
    <DeckAIAnalysis shareMode deck={deck({ aiAnalysis: "Recur [[Sun Titan]]." })} />,
  )

  await user.click(container.querySelector("summary") as HTMLElement)
  await user.click(screen.getByRole("button", { name: "Sun Titan" }))

  const dialog = await screen.findByRole("dialog", { name: "Sun Titan" })
  expect(dialog.getAttribute("data-endpoint")).toBe("/share/graphql")
  expect(dialog.getAttribute("data-private-hidden")).toBe("true")
  expect(apolloMocks.query.mock.calls[0]?.[0]).toMatchObject({
    context: { uri: "/share/graphql" },
  })
})

test("card references the catalog cannot resolve show a toast instead of a dialog", async () => {
  const user = userEvent.setup()
  const { container } = render(
    <DeckAIAnalysis deck={deck({ aiAnalysis: "Try [[Totally Made Up Card]]." })} />,
  )

  await user.click(container.querySelector("summary") as HTMLElement)
  await user.click(screen.getByRole("button", { name: "Totally Made Up Card" }))

  await waitFor(() => expect(apolloMocks.showToast).toHaveBeenCalledOnce())
  expect(apolloMocks.showToast.mock.calls[0]?.[0]).toContain("Totally Made Up Card")
  expect(apolloMocks.showToast.mock.calls[0]?.[1]).toMatchObject({ tone: "error" })
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("AI analysis panel stays hidden until an analysis exists", () => {
  const { container } = render(<DeckAIAnalysis deck={deck({ aiAnalysis: null })} />)
  expect(container.innerHTML).toBe("")
})

test("AI analysis is the first deck action", async () => {
  const user = userEvent.setup()
  const analyze = vi.fn()

  render(
    <SummaryActionMenu
      label="Deck actions"
      analyzeLabel="Refresh AI analysis"
      onAnalyze={analyze}
      onEdit={() => undefined}
    />,
  )

  await user.click(screen.getByRole("button", { name: "Deck actions" }))
  const menuItems = screen.getAllByRole("menuitem")
  expect(menuItems[0]?.textContent).toContain("Refresh AI analysis")

  await user.click(menuItems[0])
  expect(analyze).toHaveBeenCalledOnce()
})
