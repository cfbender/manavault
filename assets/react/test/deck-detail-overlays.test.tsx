import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({ mutationVariables: undefined as unknown }))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: () => Promise.resolve([]) }),
  useMutation: () => [
    (options: { onCompleted?: () => void; variables?: unknown }) => {
      apolloMocks.mutationVariables = options.variables
      options.onCompleted?.()
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

import { DeckDetailDisassemblyOverlay } from "../src/pages/decks/deck-detail-disassembly-overlay"
import { DeckDetailShortcutsOverlay } from "../src/pages/decks/deck-detail-shortcuts-overlay"
import { EditDeckDialog } from "../src/pages/decks/deck-editor-dialogs"

afterEach(() => {
  cleanup()
  apolloMocks.mutationVariables = undefined
})

const deck = { id: "deck-1", name: "Archive Test" }

const previewOverlay = {
  kind: "disassembly" as const,
  result: {
    checkedCount: 3,
    dryRun: true,
    movedCount: 2,
    moves: [],
    skippedCount: 1,
  },
}

test("disassembly preview exposes the apply action and completion dialog can be dismissed", async () => {
  const user = userEvent.setup()
  const onApply = vi.fn()
  const onClose = vi.fn()

  render(
    <DeckDetailDisassemblyOverlay
      deck={deck}
      isApplying={false}
      onApply={onApply}
      onClose={onClose}
      overlay={previewOverlay}
    />,
  )

  const dialog = screen.getByRole("dialog", { name: "Disassemble Archive Test?" })
  expect(dialog).toBeInstanceOf(HTMLElement)
  await user.click(screen.getByRole("button", { name: "Disassemble deck" }))
  expect(onApply).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole("button", { name: "Close preview" }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test("shortcut overlay has one close transition", async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()

  render(<DeckDetailShortcutsOverlay onClose={onClose} overlay={{ kind: "shortcuts" }} />)

  await user.click(screen.getByRole("button", { name: "Close dialog" }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test("deck editor chooses any deck card as the cover", async () => {
  const user = userEvent.setup()

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "Partner Deck",
          format: "commander",
          status: "active",
          coverDeckCardId: null,
          deckCards: [
            { id: "partner", zone: "commander", card: { name: "Partner Commander" } },
            { id: "favorite", zone: "mainboard", card: { name: "Favorite Card" } },
          ],
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  const coverSelect = screen.getByRole("combobox", { name: "Cover card" })
  expect(coverSelect.textContent).toContain("Automatic (commander first)")

  await user.click(coverSelect)
  await user.click(screen.getByRole("option", { name: "Favorite Card · Mainboard" }))
  await user.click(screen.getByRole("button", { name: "Save deck" }))

  expect(apolloMocks.mutationVariables).toEqual({
    id: "deck-1",
    input: {
      name: "Partner Deck",
      format: "commander",
      status: "active",
      coverDeckCardId: "favorite",
    },
  })
})
