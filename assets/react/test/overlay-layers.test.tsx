import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { Dialog, DialogContent, DialogTitle } from "../src/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../src/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../src/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src/components/ui/select"
import { BulkAllocationPullListDialog } from "../src/pages/decks/bulk-allocation"
import { DeckMarkdown } from "../src/pages/decks/deck-primer"
import { DeckZoneTable } from "../src/pages/decks/deck-zone-table"
import type { DeckCardEntry } from "../src/pages/decks/deck-types"

afterEach(cleanup)

function Modal({ children }: { children: ReactNode }) {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <DialogTitle>Overlay regression</DialogTitle>
        <button>Focus starts here</button>
        {children}
      </DialogContent>
    </Dialog>
  )
}

// Check the actual portal ancestry and computed stacking order, not a magic
// Tailwind class. A high z-index inside a dialog still cannot escape its layer.
async function expectAboveDialogs(surface: HTMLElement) {
  await waitFor(() => {
    let portalRoot = surface
    while (portalRoot.parentElement && portalRoot.parentElement !== document.body) {
      portalRoot = portalRoot.parentElement
    }
    const layer = Number(getComputedStyle(surface).zIndex)
    expect(layer).toBeGreaterThan(0)
    const dialogs = screen
      .getAllByRole("dialog", { hidden: true })
      .filter((dialog) => dialog !== surface)
    expect(dialogs.length).toBeGreaterThan(0)
    for (const dialog of dialogs) {
      expect(dialog.contains(surface)).toBe(false)
      const wrapper = dialog.parentElement!
      const backdrop = wrapper.previousElementSibling!
      for (const boundary of [wrapper, backdrop]) {
        const dialogLayer = Number(getComputedStyle(boundary).zIndex)
        expect(dialogLayer).toBeGreaterThan(0)
        expect(layer).toBeGreaterThan(dialogLayer)
        expect(Number(getComputedStyle(portalRoot).zIndex)).toBeGreaterThan(dialogLayer)
      }
    }
  })
}

test.each(["dropdown", "select", "popover"])(
  "%s escapes stacked dialogs and ignores stale call-site layer overrides",
  async (kind) => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    // These were real low-layer overrides used by card menus. Other custom
    // styles must survive, but callers cannot demote a body portal below a modal.
    const props = { className: "z-[140]", style: { zIndex: 140, width: 208 } }
    render(
      <Modal>
        <Modal>
          {kind === "dropdown" ? (
            <DropdownMenu>
              <DropdownMenuTrigger>Open overlay</DropdownMenuTrigger>
              <DropdownMenuContent {...props}>
                <DropdownMenuItem onSelect={onSelect}>Choose printing</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : kind === "select" ? (
            <Select onValueChange={onSelect}>
              <SelectTrigger aria-label="Open overlay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent {...props}>
                <SelectItem value="foil">Choose printing</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Popover>
              <PopoverTrigger>Open overlay</PopoverTrigger>
              <PopoverContent {...props} aria-label="Printing options">
                <button onClick={onSelect}>Choose printing</button>
              </PopoverContent>
            </Popover>
          )}
        </Modal>
      </Modal>,
    )
    // Keyboard opening also exercises Radix's dialog focus trap.
    screen.getByRole(kind === "select" ? "combobox" : "button", { name: "Open overlay" }).focus()
    await user.keyboard("{Enter}")
    const role = kind === "dropdown" ? "menu" : kind === "select" ? "listbox" : "dialog"
    const surface = await screen.findByRole(
      role,
      kind === "popover" ? { name: "Printing options" } : {},
    )
    await expectAboveDialogs(surface)
    expect(getComputedStyle(surface).width).toBe("208px")
    await user.click(screen.getByText("Choose printing"))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(
      screen.getAllByRole("dialog", { hidden: true }).filter((dialog) => dialog !== surface),
    ).toHaveLength(2)
  },
)

const card = {
  id: "deck-card-1",
  quantity: 1,
  zone: "mainboard",
  finish: "nonfoil",
  card: { id: "card-1", name: "Sol Ring", typeLine: "Artifact" },
  preferredPrinting: { id: "printing-1", imageUrl: "/images/sol-ring.jpg" },
  allocationStatus: { state: "available", allocated: 0, required: 1, available: 1, candidates: [] },
} as unknown as DeckCardEntry

test("deck zone hover preview escapes the dialog and its scroll container", async () => {
  render(
    <Modal>
      <DeckZoneTable
        cards={[card]}
        deckId="deck-1"
        highlightedCardIds={null}
        isSelecting={false}
        isUpdating={false}
        onDelete={() => {}}
        onEdit={() => {}}
        onMove={() => {}}
        onPreview={() => {}}
        onTag={() => {}}
        onToggleSelected={() => {}}
        selectedCardIds={new Set()}
        shareMode
        title="Sideboard"
      />
    </Modal>,
  )
  fireEvent.click(screen.getByText("Sideboard"))
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Sol Ring" }))
  const image = document.querySelector<HTMLImageElement>('img[src="/images/sol-ring.jpg"]')!
  expect(image).not.toBeNull()
  await expectAboveDialogs(image.parentElement!)
})

test("Markdown card hover preview stays above stacked dialogs", async () => {
  render(
    <Modal>
      <Modal>
        <DeckMarkdown cardReferences>{"[[Sol Ring]]"}</DeckMarkdown>
      </Modal>
    </Modal>,
  )
  fireEvent.pointerEnter(screen.getByRole("link", { name: "Sol Ring" }), { pointerType: "mouse" })
  const image = await screen.findByAltText("Sol Ring card preview")
  await expectAboveDialogs(image.parentElement!)
})

test("pull-list card preview portals out of the scrollable dialog", async () => {
  render(
    <BulkAllocationPullListDialog
      open
      error={null}
      excludedEntryIds={{}}
      isPending={false}
      mode="exact"
      onClose={() => {}}
      onConfirm={() => {}}
      onModeChange={() => {}}
      onSelectChoice={() => {}}
      onToggleEntry={() => {}}
      selectedItemIds={{}}
      pullList={{
        needed: 1,
        selected: 1,
        skipped: 0,
        choices: [],
        skippedDeckCards: [],
        exactEntries: [
          {
            id: "entry-1",
            deckCard: card,
            quantity: 1,
            exact: true,
            candidate: {
              available: 1,
              allocated: 0,
              item: { id: "item-1", finish: "nonfoil", quantity: 1 },
            } as DeckCardEntry["allocationStatus"]["candidates"][number],
          },
        ],
      }}
    />,
  )
  fireEvent.pointerEnter(screen.getByRole("link", { name: "Sol Ring" }))
  const preview = screen.getByLabelText("Open Sol Ring card details in a new tab")
  await expectAboveDialogs(preview)
  expect(preview.parentElement).toBe(document.body)
})
