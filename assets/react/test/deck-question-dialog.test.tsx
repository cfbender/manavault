import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import type { DeckCardEntry } from "../src/pages/decks/deck-types"

type QuestionAnswer = {
  id: string
  conversationId: string | null
  question: string
  answer: string
  status: string
  error: string | null
  model: string | null
  recommendedCuts: string[]
  recommendedAdditions: string[]
  insertedAt: string
}

const apolloMocks = vi.hoisted(() => ({
  askVariables: null as { id: string; question: string; conversationId: string | null } | null,
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
        conversationId: null,
        question: "How should I protect my counters?",
        answer: `Keep mana open for [[Flawless Maneuver]].

| Cut | Addition | Mana cost |
| :--- | :--- | :--- |
| [[Approach of the Second Sun]] | [[Sun Titan]] | {4}{W}{W} |`,
        status: "completed",
        error: null,
        model: "anthropic/claude-sonnet-4",
        recommendedCuts: ["Approach of the Second Sun", "Deepglow Skate"],
        recommendedAdditions: ["Sun Titan", "Doubling Season"],
        insertedAt: "2026-08-19T03:00:00Z",
      },
      {
        id: "history-1",
        conversationId: null,
        question: "What is the weakest card?",
        answer: "Start by testing a cut from the top of the curve.",
        status: "completed",
        error: null,
        model: "openai/gpt-5-mini",
        recommendedCuts: [],
        recommendedAdditions: [],
        insertedAt: "2026-08-18T03:00:00Z",
      },
    ] as QuestionAnswer[],
  },
  refetchQueries: vi.fn(() => Promise.resolve()),
  refetch: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  cardQuery: vi.fn(async () => ({
    data: {
      cardByName: {
        id: "card-sun-titan",
        name: "Sun Titan",
        printings: {
          edges: [{ node: { id: "printing-sun-titan", imageUrl: "/images/sun-titan.jpg" } }],
        },
      },
    },
  })),
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
  useApolloClient: () => ({
    query: apolloMocks.cardQuery,
    refetchQueries: apolloMocks.refetchQueries,
  }),
  useQuery: () => ({
    data: apolloMocks.historyData,
    error: undefined,
    loading: false,
    refetch: apolloMocks.refetch,
    startPolling: apolloMocks.startPolling,
    stopPolling: apolloMocks.stopPolling,
  }),
  useMutation: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const operationName = document.definitions[0]?.name?.value

    if (operationName === "AskDeckQuestion") {
      return [
        (options: {
          variables: { id: string; question: string; conversationId: string | null }
          onCompleted?: (data: { askDeckQuestion: { questionAnswer: QuestionAnswer } }) => void
        }) => {
          apolloMocks.askVariables = options.variables
          options.onCompleted?.({
            askDeckQuestion: {
              questionAnswer: {
                id: "history-3",
                conversationId: options.variables.conversationId,
                question: options.variables.question,
                answer: "",
                status: "pending",
                error: null,
                model: null,
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

const originalHistory = structuredClone(apolloMocks.historyData)

afterEach(() => {
  cleanup()
  apolloMocks.askVariables = null
  apolloMocks.addVariables = []
  apolloMocks.deleteVariables = null
  apolloMocks.tagVariables = null
  apolloMocks.refetchQueries.mockClear()
  apolloMocks.startPolling.mockClear()
  apolloMocks.stopPolling.mockClear()
  apolloMocks.historyData = structuredClone(originalHistory)
})

test("renders saved questions as an oldest-first conversation", () => {
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
  const entries = within(dialog).getAllByRole("article", { name: /\?/ })

  expect(dialog.querySelector("details")).toBeNull()
  expect(entries).toHaveLength(2)
  expect(entries[0]?.textContent).toContain("What is the weakest card?")
  expect(entries[1]?.textContent).toContain("How should I protect my counters?")
  expect(entries[1]?.textContent).toContain("anthropic/claude-sonnet-4 · Asked")
})

test("renders a persisted AI failure instead of an empty answer", () => {
  apolloMocks.historyData.deckQuestionAnswers[0]!.status = "failed"
  apolloMocks.historyData.deckQuestionAnswers[0]!.error =
    "OpenRouter could not answer this question."

  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open={true}
      onOpenChange={() => undefined}
    />,
  )

  expect(screen.getByText("OpenRouter could not answer this question.")).toBeInstanceOf(HTMLElement)
  expect(screen.queryByRole("region", { name: "Suggested deck changes" })).toBeNull()
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

  const entry = screen.getByRole("article", { name: "How should I protect my counters?" })

  const table = within(entry as HTMLElement).getByRole("table")
  expect(within(table).getAllByRole("row")).toHaveLength(2)
  expect(within(table).getByRole("columnheader", { name: "Addition" })).toBeInstanceOf(HTMLElement)
  expect(within(entry as HTMLElement).getAllByAltText("White")).toHaveLength(2)

  const cardReference = within(entry as HTMLElement).getByRole("button", { name: "Sun Titan" })
  expect(within(entry as HTMLElement).queryByRole("link", { name: "Sun Titan" })).toBeNull()

  fireEvent.focus(cardReference)
  const preview = await screen.findByRole("img", { name: "Sun Titan card preview" })
  expect(preview.getAttribute("src")).toBe("/images/sun-titan.jpg")
})

test("submits a trimmed deck question, shows pending work, and starts polling", async () => {
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
  const question = screen.getByRole("textbox", { name: "Ask about this deck" })
  const submit = screen.getByRole("button", { name: "Send question" })

  expect(dialog.getAttribute("aria-describedby")).toBe("deck-question-description")
  expect(screen.getByText(/Counter Deck/)).toBeInstanceOf(HTMLElement)
  expect((submit as HTMLButtonElement).disabled).toBe(true)

  await user.type(question, "  Would Doubling Season fit?  ")
  await user.click(submit)

  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "Would Doubling Season fit?",
    conversationId: null,
  })
  expect((question as HTMLTextAreaElement).value).toBe("")
  expect(screen.getByText("Would Doubling Season fit?")).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("status").textContent).toBe("Thinking…")
  expect(screen.getByText(/saved with this deck/i)).toBeInstanceOf(HTMLElement)
  expect(apolloMocks.startPolling).toHaveBeenCalledWith(2_000)

  const entries = screen.getAllByRole("article")
  expect(entries.at(-1)?.textContent).toContain("Would Doubling Season fit?")

  apolloMocks.askVariables = null
  await user.type(question, "Anything cheaper?{Enter}")
  expect(apolloMocks.askVariables).toBeNull()
  expect((submit as HTMLButtonElement).disabled).toBe(true)
  expect((question as HTMLTextAreaElement).value).toBe("Anything cheaper?")
})

test("Enter sends a follow-up while Shift+Enter adds a line break", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open
      onOpenChange={() => {}}
    />,
  )
  const question = screen.getByRole("textbox", { name: "Ask about this deck" })

  await user.type(question, "Why that cut?{Shift>}{Enter}{/Shift}Keep the budget low.")
  expect(apolloMocks.askVariables).toBeNull()
  await user.keyboard("{Enter}")
  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "Why that cut?\nKeep the budget low.",
    conversationId: null,
  })
})

test("starter prompts send a deck question", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open
      onOpenChange={() => {}}
    />,
  )
  await user.click(screen.getByRole("button", { name: "How can I improve the mana base?" }))
  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "How can I improve the mana base?",
    conversationId: null,
  })
})

test("starts a fresh chat without deleting history and reopens the original conversation", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open
      onOpenChange={() => {}}
    />,
  )

  await user.click(screen.getByRole("button", { name: "New chat" }))
  expect(screen.queryByRole("article", { name: "What is the weakest card?" })).toBeNull()
  expect(apolloMocks.deleteVariables).toBeNull()
  await user.type(
    screen.getByRole("textbox", { name: "Ask about this deck" }),
    "A fresh plan{Enter}",
  )
  expect(apolloMocks.askVariables).toMatchObject({
    id: "deck-1",
    question: "A fresh plan",
    conversationId: expect.stringMatching(/^chat-/),
  })
  expect(screen.getByRole("article", { name: "A fresh plan" })).toBeTruthy()
  expect(screen.getByRole("status").textContent).toBe("Thinking…")

  await user.click(screen.getByRole("combobox", { name: "Saved chats" }))
  await user.click(screen.getByRole("option", { name: /What is the weakest card/ }))
  expect(screen.getByRole("article", { name: "What is the weakest card?" })).toBeTruthy()
  expect(screen.getByRole("article", { name: "How should I protect my counters?" })).toBeTruthy()
  expect(screen.queryByRole("article", { name: "A fresh plan" })).toBeNull()
  expect(screen.queryByRole("status")).toBeNull()
  // The pending answer in the other chat still gets polled.
  expect(apolloMocks.startPolling).toHaveBeenCalledWith(2_000)

  await user.type(
    screen.getByRole("textbox", { name: "Ask about this deck" }),
    "Continue the original{Enter}",
  )
  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "Continue the original",
    conversationId: null,
  })
})

test("reopens the most recently active saved chat and sends to that conversation", async () => {
  apolloMocks.historyData.deckQuestionAnswers.unshift({
    ...apolloMocks.historyData.deckQuestionAnswers[1]!,
    id: "new-chat-turn",
    conversationId: "chat-newer",
    question: "A separate plan",
    insertedAt: "2026-08-20T03:00:00Z",
  })
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
      deckCards={deckCards}
      deckId="deck-1"
      deckName="Counter Deck"
      open
      onOpenChange={() => {}}
    />,
  )
  expect(screen.getByRole("article", { name: "A separate plan" })).toBeTruthy()
  expect(screen.queryByRole("article", { name: "What is the weakest card?" })).toBeNull()
  await user.type(
    screen.getByRole("textbox", { name: "Ask about this deck" }),
    "Tell me more{Enter}",
  )
  expect(apolloMocks.askVariables).toEqual({
    id: "deck-1",
    question: "Tell me more",
    conversationId: "chat-newer",
  })
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
