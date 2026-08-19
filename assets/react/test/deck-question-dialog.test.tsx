import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  mutationVariables: null as { id: string; question: string } | null,
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [
    (options: {
      variables: { id: string; question: string }
      onCompleted?: (data: { askDeckQuestion: { answer: string } }) => void
    }) => {
      apolloMocks.mutationVariables = options.variables
      options.onCompleted?.({
        askDeckQuestion: {
          answer: "**Yes.** It doubles the deck's +1/+1 counters and token production.",
        },
      })
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
}))

import { DeckQuestionDialog } from "../src/pages/decks/deck-question-dialog"

afterEach(() => {
  cleanup()
  apolloMocks.mutationVariables = null
})

test("submits a trimmed deck question and renders the Markdown answer", async () => {
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

  expect(apolloMocks.mutationVariables).toEqual({
    id: "deck-1",
    question: "Would Doubling Season fit?",
  })
  expect(screen.getByRole("heading", { name: "Answer" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/doubles the deck's \+1\/\+1 counters/i)).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/are not saved/i)).toBeInstanceOf(HTMLElement)
})
