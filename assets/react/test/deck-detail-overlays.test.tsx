import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  mutationVariables: undefined as unknown,
  queryData: undefined as unknown,
}))

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
  useQuery: () => ({ data: apolloMocks.queryData, error: undefined, loading: false }),
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
  apolloMocks.queryData = undefined
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
          playCount: 0,
          skipCount: 0,
          lastPlayedAt: null,
          primer: "## Plan\n\nProtect the commanders.",
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
      playCount: 0,
      skipCount: 0,
      lastPlayedAt: null,
      primer: "## Plan\n\nProtect the commanders.",
      coverDeckCardId: "favorite",
    },
  })
})

test("deck editor saves and clears primer Markdown", async () => {
  const user = userEvent.setup()

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "Primer Deck",
          format: "commander",
          status: "brewing",
          playCount: 0,
          skipCount: 0,
          lastPlayedAt: null,
          primer: "Old plan",
          coverDeckCardId: null,
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  const primer = screen.getByRole("textbox", { name: "Primer" })
  await user.clear(primer)
  await user.click(screen.getByRole("button", { name: "Save deck" }))

  expect(apolloMocks.mutationVariables).toEqual({
    id: "deck-1",
    input: {
      name: "Primer Deck",
      format: "commander",
      status: "brewing",
      playCount: 0,
      skipCount: 0,
      lastPlayedAt: null,
      primer: null,
    },
  })
})

test("deck editor imports historical play data", async () => {
  const user = userEvent.setup()

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "History Deck",
          format: "commander",
          status: "active",
          playCount: 2,
          skipCount: 1,
          lastPlayedAt: null,
          primer: null,
          coverDeckCardId: null,
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  const plays = screen.getByRole("spinbutton", { name: "Plays" })
  const skips = screen.getByRole("spinbutton", { name: "Skips" })
  const lastPlayed = screen.getByLabelText("Last played")

  expect((plays as HTMLInputElement).value).toBe("2")
  expect((skips as HTMLInputElement).value).toBe("1")
  expect((lastPlayed as HTMLInputElement).value).toBe("")

  await user.clear(plays)
  await user.type(plays, "14")
  await user.clear(skips)
  await user.type(skips, "3")
  fireEvent.change(lastPlayed, { target: { value: "2026-08-10" } })
  await user.click(screen.getByRole("button", { name: "Save deck" }))

  expect(apolloMocks.mutationVariables).toEqual({
    id: "deck-1",
    input: {
      name: "History Deck",
      format: "commander",
      status: "active",
      playCount: 14,
      skipCount: 3,
      lastPlayedAt: new Date(2026, 7, 10).toISOString(),
      primer: null,
    },
  })
})

test("deck editor loads historical data when the detail query omits private fields", () => {
  apolloMocks.queryData = {
    deck: { id: "deck-1", playCount: 9, skipCount: 5, lastPlayedAt: "2026-06-12T00:00:00Z" },
  }

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "Private History",
          format: "commander",
          status: "active",
          primer: null,
          coverDeckCardId: null,
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  expect((screen.getByRole("spinbutton", { name: "Plays" }) as HTMLInputElement).value).toBe("9")
  expect((screen.getByRole("spinbutton", { name: "Skips" }) as HTMLInputElement).value).toBe("5")
  expect((screen.getByLabelText("Last played") as HTMLInputElement).value).toBe("2026-06-12")
})

test("deck editor clears the last-played date", async () => {
  const user = userEvent.setup()

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "Clear History",
          format: "modern",
          status: "archived",
          playCount: 8,
          skipCount: 2,
          lastPlayedAt: "2026-08-10T12:00:00Z",
          primer: null,
          coverDeckCardId: null,
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  fireEvent.change(screen.getByLabelText("Last played"), { target: { value: "" } })
  await user.click(screen.getByRole("button", { name: "Save deck" }))

  expect(apolloMocks.mutationVariables).toEqual({
    id: "deck-1",
    input: {
      name: "Clear History",
      format: "modern",
      status: "archived",
      playCount: 8,
      skipCount: 2,
      lastPlayedAt: null,
      primer: null,
    },
  })
})

test("deck editor rejects invalid historical counts", async () => {
  const user = userEvent.setup()

  render(
    <EditDeckDialog
      deck={
        {
          id: "deck-1",
          name: "Invalid History",
          format: "commander",
          status: "brewing",
          playCount: 0,
          skipCount: 0,
          lastPlayedAt: null,
          primer: null,
          coverDeckCardId: null,
        } as never
      }
      open
      onOpenChange={vi.fn()}
    />,
  )

  fireEvent.change(screen.getByRole("spinbutton", { name: "Plays" }), {
    target: { value: "-1" },
  })
  await user.click(screen.getByRole("button", { name: "Save deck" }))

  expect(screen.getByText("Play and skip counts must be whole numbers of 0 or more")).toBeTruthy()
  expect(apolloMocks.mutationVariables).toBeUndefined()
})
