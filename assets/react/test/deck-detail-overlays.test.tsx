import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { DeckDetailDisassemblyOverlay } from "../src/pages/decks/deck-detail-disassembly-overlay"
import { DeckDetailShortcutsOverlay } from "../src/pages/decks/deck-detail-shortcuts-overlay"

afterEach(cleanup)

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
