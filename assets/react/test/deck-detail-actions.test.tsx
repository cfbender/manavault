import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  analyzeDeck: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [mocks.analyzeDeck, { loading: false }],
  useQuery: () => ({
    data: undefined,
    loading: false,
    refetch: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#playtest">{children}</a>,
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

import { DeckDetailHeader } from "../src/pages/decks/deck-detail-header"

afterEach(() => {
  cleanup()
  mocks.analyzeDeck.mockReset()
  mocks.showToast.mockReset()
})

function renderHeader(shareMode: boolean, onCombos = () => undefined) {
  const noOp = () => undefined

  render(
    <DeckDetailHeader
      canEdit={true}
      deck={
        {
          id: "deck-1",
          name: "Counter Deck",
          format: "commander",
          status: "active",
          primer: null,
          aiAnalysis: null,
          coverImageUrl: null,
          commanderColorIdentity: [],
          cardCount: 0,
          legality: { status: "legal", issues: [] },
        } as never
      }
      deckCards={[]}
      deckPrice={null}
      deckTags={[]}
      groupBy="theme"
      hasBuylistWork={false}
      hasReadinessWork={false}
      isRefreshing={false}
      isSelectionActive={false}
      legalityIssues={[]}
      saltSum={null}
      onAddCard={noOp}
      onCombos={onCombos}
      onCompareDeck={noOp}
      onCopySharedDecklist={noOp}
      onDisassemble={noOp}
      onDownloadSharedDecklist={noOp}
      onEditDeck={noOp}
      onExportDeck={noOp}
      onGroupByChange={noOp}
      onImportDeck={noOp}
      onMissingCards={noOp}
      onOpenEdhrec={noOp}
      onOpenReadiness={noOp}
      onShareBuylist={noOp}
      onShareDeck={noOp}
      onSharePlaytest={noOp}
      onStartSelecting={noOp}
      shareCopyState="idle"
      shareMode={shareMode}
      tagActions={{
        activeTagId: null,
        onCreate: noOp,
        onDelete: noOp,
        onJumpTo: noOp,
        onReorder: noOp,
        onUpdate: noOp,
      }}
      zoneCounts={{ commander: 0, mainboard: 0, considering: 0 }}
    >
      <div>Deck cards</div>
    </DeckDetailHeader>,
  )
}

test("private deck actions put Ask AI immediately before Playtest", async () => {
  const user = userEvent.setup()
  renderHeader(false)

  const ask = screen.getByRole("button", { name: "Ask AI" })
  const playtest = screen.getByRole("link", { name: "Playtest" })

  expect(ask.nextElementSibling).toBe(playtest)

  await user.click(ask)
  expect(screen.getByRole("dialog", { name: "Ask about this deck" })).toBeInstanceOf(HTMLElement)
})

test("shared deck actions do not expose the AI question tool", () => {
  renderHeader(true)

  expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull()
  expect(screen.queryByRole("dialog", { name: "Ask about this deck" })).toBeNull()
})

test("AI deck analysis shows progress until the request completes", async () => {
  const user = userEvent.setup()
  mocks.analyzeDeck.mockImplementation(({ onCompleted }: { onCompleted?: () => void }) => {
    onCompleted?.()
    return Promise.resolve()
  })
  renderHeader(false)

  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  await user.click(screen.getByRole("menuitem", { name: "Analyze deck with AI" }))

  expect(mocks.showToast).toHaveBeenNthCalledWith(1, "Analyzing Counter Deck with AI…", {
    id: "deck-analysis-deck-1",
    loading: true,
    tone: "info",
  })
  expect(mocks.showToast).toHaveBeenNthCalledWith(2, "Deck analysis complete.", {
    id: "deck-analysis-deck-1",
  })
})

test("private deck menu opens the infinite combo lookup", async () => {
  const user = userEvent.setup()
  const onCombos = vi.fn()
  renderHeader(false, onCombos)

  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  await user.click(screen.getByRole("menuitem", { name: "Infinite combos" }))

  expect(onCombos).toHaveBeenCalledTimes(1)
})
