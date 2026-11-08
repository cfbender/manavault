import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ decksData: undefined as unknown }))

function decksData(externalSource: string | null) {
  return {
    decks: {
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [
        {
          node: {
            id: "deck-1",
            name: "Linkable",
            format: "commander",
            status: "active",
            cardCount: 100,
            externalSource,
          },
        },
      ],
    },
  }
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/decks/deck-1">{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [vi.fn(), { loading: false }],
  useQuery: () => ({
    data: mocks.decksData,
    error: undefined,
    fetchMore: vi.fn(),
    loading: false,
    refetch: vi.fn(),
  }),
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("../src/pages/decks/deck-actions", () => ({
  SummaryActionMenu: ({ label, onEdit }: { label: string; onEdit: () => void }) => (
    <button type="button" onClick={onEdit}>
      Edit {label}
    </button>
  ),
}))

// Stand-in for the dialog: shows whether the deck it was handed is linked.
vi.mock("../src/pages/decks/deck-editor-dialogs", () => ({
  EditDeckDialog: ({ deck }: { deck: { externalSource: string | null } | null }) =>
    deck ? <p>Editing: {deck.externalSource ?? "unlinked"}</p> : null,
  NewDeckDialog: () => null,
}))

vi.mock("../src/pages/decks/deck-box", () => ({ DeckBox: () => null }))
vi.mock("../src/pages/decks/deck-bracket", () => ({ DeckBracketBadge: () => null }))
vi.mock("../src/pages/decks/deck-legality", () => ({
  deckLegalityIssueCount: () => 0,
  deckLegalityIssueCountLabel: () => "",
  deckLegalityLabel: () => "Legal",
  deckLegalityTone: () => "success",
}))
vi.mock("../src/pages/decks/deck-analysis-dialog", () => ({ DeckAnalysisDialog: () => null }))
vi.mock("../src/pages/decks/deck-combos-dialog", () => ({ DeckCombosDialog: () => null }))
vi.mock("../src/pages/decks/deck-picker", () => ({
  DeckPlayHistory: () => null,
  RandomDeckDialog: () => null,
}))
vi.mock("../src/pages/decks/deck-share-dialogs", () => ({ ShareDeckDialog: () => null }))
vi.mock("../src/pages/decks/precon-import-dialog", () => ({ PreconImportDialog: () => null }))

import { DecksPage } from "../src/pages/decks/list-page"

afterEach(() => {
  cleanup()
  mocks.decksData = undefined
})

test("the edit dialog follows the decks query after linking and unlinking", async () => {
  const user = userEvent.setup()
  mocks.decksData = decksData(null)
  const { rerender } = render(<DecksPage />)

  await user.click(screen.getByRole("button", { name: "Edit Linkable actions" }))
  expect(screen.getByText("Editing: unlinked")).toBeTruthy()

  // Linking refetches the Decks query; the open dialog must see the new deck.
  mocks.decksData = decksData("moxfield")
  rerender(<DecksPage />)
  expect(screen.getByText("Editing: moxfield")).toBeTruthy()

  mocks.decksData = decksData(null)
  rerender(<DecksPage />)
  expect(screen.getByText("Editing: unlinked")).toBeTruthy()
})
