import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import type { DeckCardEntry } from "../src/pages/decks/deck-types"

type QuestionAnswer = {
  id: string
  question: string
  answer: string
  recommendedCuts: string[]
  recommendedAdditions: string[]
  insertedAt: string
}

const apolloMocks = vi.hoisted(() => ({
  askVariables: null as { id: string; question: string } | null,
  addVariables: [] as Array<{
    deckId: string
    input: { name: string; quantity: number; zone: string }
  }>,
  deleteVariables: null as { id: string } | null,
  tagVariables: null as { deckCardIds: string[]; tag: string } | null,
  historyData: {
    deckQuestionAnswers: [
      {
        id: "history-2",
        question: "How should I protect my counters?",
        answer: `Keep mana open for [[Flawless Maneuver]].

| Cut | Addition | Mana cost |
| :--- | :--- | :--- |
| [[Approach of the Second Sun]] | [[Sun Titan]] | {4}{W}{W} |`,
        recommendedCuts: ["Approach of the Second Sun", "Deepglow Skate"],
        recommendedAdditions: ["Sun Titan", "Doubling Season"],
        insertedAt: "2026-08-19T03:00:00Z",
      },
      {
        id: "history-1",
        question: "What is the weakest card?",
        answer: "Start by testing a cut from the top of the curve.",
        recommendedCuts: [],
        recommendedAdditions: [],
        insertedAt: "2026-08-18T03:00:00Z",
      },
    ] satisfies QuestionAnswer[],
  },
  refetchQueries: vi.fn(() => Promise.resolve()),
  refetch: vi.fn(),
}))

const deckCards = [
  {
    id: "deck-card-approach",
    zone: "mainboard",
    tag: null,
    card: { name: "Approach of the Second Sun" },
  },
  {
    id: "deck-card-deepglow",
    zone: "mainboard",
    tag: null,
    card: { name: "Deepglow Skate" },
  },
] as unknown as DeckCardEntry[]

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: apolloMocks.refetchQueries }),
  useQuery: () => ({
    data: apolloMocks.historyData,
    error: undefined,
    loading: false,
    refetch: apolloMocks.refetch,
  }),
  useMutation: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const operationName = document.definitions[0]?.name?.value

    if (operationName === "AskDeckQuestion") {
      return [
        (options: {
          variables: { id: string; question: string }
          onCompleted?: (data: {
            askDeckQuestion: { answer: string; questionAnswer: QuestionAnswer }
          }) => void
        }) => {
          const answer = "**Yes.** It doubles the deck's +1/+1 counters and token production."
          apolloMocks.askVariables = options.variables
          options.onCompleted?.({
            askDeckQuestion: {
              answer,
              questionAnswer: {
                id: "history-3",
                question: options.variables.question,
                answer,
                recommendedCuts: [],
                recommendedAdditions: [],
                insertedAt: "2026-08-19T04:00:00Z",
              },
            },
          })
          return Promise.resolve({ data: {} })
        },
        { loading: false },
      ]
    }

    if (operationName === "UpdateDeckCardsTag") {
      return [
        (options: { variables: { deckCardIds: string[]; tag: string } }) => {
          apolloMocks.tagVariables = options.variables
          return Promise.resolve({ data: {} })
        },
        { loading: false },
      ]
    }

    if (operationName === "AddDeckCard") {
      return [
        (options: {
          variables: {
            deckId: string
            input: { name: string; quantity: number; zone: string }
          }
        }) => {
          apolloMocks.addVariables.push(options.variables)
          return Promise.resolve({ data: {} })
        },
        { loading: false },
      ]
    }

    return [
      (options: {
        variables: { id: string }
        onCompleted?: (data: { deleteDeckQuestionAnswer: { questionAnswerId: string } }) => void
      }) => {
        apolloMocks.deleteVariables = options.variables
        options.onCompleted?.({
          deleteDeckQuestionAnswer: { questionAnswerId: options.variables.id },
        })
        return Promise.resolve({ data: {} })
      },
      { loading: false },
    ]
  },
}))

import { DeckQuestionDialog } from "../src/pages/decks/deck-question-dialog"

afterEach(() => {
  cleanup()
  apolloMocks.askVariables = null
  apolloMocks.addVariables = []
  apolloMocks.deleteVariables = null
  apolloMocks.tagVariables = null
  apolloMocks.refetchQueries.mockClear()
})

test("renders saved questions newest first in collapsible sections", () => {
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  const dialog = screen.getByRole("dialog", { name: "Ask about this deck" })
  const entries = dialog.querySelectorAll("details")

  expect(screen.getByRole("heading", { name: "Saved questions" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText("2 saved")).toBeInstanceOf(HTMLElement)
  expect(entries).toHaveLength(2)
  expect(entries[0]?.textContent).toContain("How should I protect my counters?")
  expect(entries[1]?.textContent).toContain("What is the weakest card?")
  expect(entries[0]?.open).toBe(true)
  expect(entries[1]?.open).toBe(false)
})

test("renders answer tables, mana symbols, and card links with previews", async () => {
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  const entry = screen.getByRole("dialog", { name: "Ask about this deck" }).querySelector("details")
  expect(entry).not.toBeNull()

  const table = within(entry as HTMLElement).getByRole("table")
  expect(within(table).getAllByRole("row")).toHaveLength(2)
  expect(within(table).getByRole("columnheader", { name: "Addition" })).toBeInstanceOf(HTMLElement)
  expect(within(entry as HTMLElement).getAllByAltText("White")).toHaveLength(2)

  const cardLink = within(entry as HTMLElement).getByRole("link", { name: "Sun Titan" })
  expect(cardLink.getAttribute("href")).toBe("/cards?q=Sun%20Titan")

  fireEvent.focus(cardLink)
  const preview = await screen.findByRole("img", { name: "Sun Titan card preview" })
  expect(preview.getAttribute("src")).toContain("exact=Sun%20Titan")
})

test("submits a trimmed deck question and adds the saved Markdown answer at the top", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  const dialog = screen.getByRole("dialog", { name: "Ask about this deck" })
  const question = screen.getByRole("textbox", { name: "Your question" })
  const submit = screen.getByRole("button", { name: "Ask question" })

  expect(dialog.getAttribute("aria-describedby")).toBe("deck-question-description")
  expect(screen.getByText("Counter Deck")).toBeInstanceOf(HTMLElement)
  expect((submit as HTMLButtonElement).disabled).toBe(true)

  await user.type(question, "  Would Doubling Season fit?  ")
  await user.click(submit)

  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "Would Doubling Season fit?",
  })
  expect((question as HTMLTextAreaElement).value).toBe("")
  expect(screen.getByText("Would Doubling Season fit?")).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/doubles the deck's \+1\/\+1 counters/i)).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/saved with this deck/i)).toBeInstanceOf(HTMLElement)

  const entries = screen
    .getByRole("dialog", { name: "Ask about this deck" })
    .querySelectorAll("details")
  expect(entries[0]?.textContent).toContain("Would Doubling Season fit?")
})

test("selectively applies recommended cuts and additions", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  expect(screen.getByRole("region", { name: "Suggested deck changes" })).toBeInstanceOf(HTMLElement)
  for (const cardName of [
    "Approach of the Second Sun",
    "Deepglow Skate",
    "Sun Titan",
    "Doubling Season",
  ]) {
    expect((screen.getByRole("checkbox", { name: cardName }) as HTMLInputElement).checked).toBe(
      true,
    )
  }

  await user.click(screen.getByRole("checkbox", { name: "Deepglow Skate" }))
  await user.click(screen.getByRole("checkbox", { name: "Doubling Season" }))
  await user.click(screen.getByRole("button", { name: "Mark 1 Consider Cutting" }))
  await user.click(screen.getByRole("button", { name: "Add 1 to Considering" }))

  expect(apolloMocks.tagVariables).toEqual({
    deckCardIds: ["deck-card-approach"],
    tag: "consider_cutting",
  })
  expect(apolloMocks.addVariables).toEqual([
    {
      deckId: "deck-1",
      input: { name: "Sun Titan", quantity: 1, zone: "considering" },
    },
  ])
  expect(await screen.findByText("1 card marked Consider Cutting.")).toBeInstanceOf(HTMLElement)
  expect(await screen.findByText("1 card added to Considering.")).toBeInstanceOf(HTMLElement)
})

test("deletes a saved question after confirmation", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  await user.click(
    screen.getByRole("button", {
      name: "Delete saved question: What is the weakest card?",
    }),
  )

  const confirmation = screen.getByRole("alertdialog", { name: "Delete saved question?" })
  expect(within(confirmation).getByText(/permanently removes/i)).toBeInstanceOf(HTMLElement)
  await user.click(within(confirmation).getByRole("button", { name: "Delete saved answer" }))

  expect(apolloMocks.deleteVariables).toEqual({ id: "history-1" })
  await waitFor(() => expect(screen.queryByText("What is the weakest card?")).toBeNull())
})
