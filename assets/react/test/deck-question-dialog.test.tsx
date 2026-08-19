import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

type QuestionAnswer = {
  id: string
  question: string
  answer: string
  insertedAt: string
}

const apolloMocks = vi.hoisted(() => ({
  askVariables: null as { id: string; question: string } | null,
  deleteVariables: null as { id: string } | null,
  historyData: {
    deckQuestionAnswers: [
      {
        id: "history-2",
        question: "How should I protect my counters?",
        answer: "Keep mana open for **Heroic Intervention**.",
        insertedAt: "2026-08-19T03:00:00Z",
      },
      {
        id: "history-1",
        question: "What is the weakest card?",
        answer: "Start by testing a cut from the top of the curve.",
        insertedAt: "2026-08-18T03:00:00Z",
      },
    ] satisfies QuestionAnswer[],
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
                insertedAt: "2026-08-19T04:00:00Z",
              },
            },
          })
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
  apolloMocks.deleteVariables = null
})

test("renders saved questions newest first in collapsible sections", () => {
  render(
    <DeckQuestionDialog
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

test("submits a trimmed deck question and adds the saved Markdown answer at the top", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
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

test("deletes a saved question after confirmation", async () => {
  const user = userEvent.setup()
  render(
    <DeckQuestionDialog
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
