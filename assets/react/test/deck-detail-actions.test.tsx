import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"

import { DeckAnalysisJobDocument } from "../src/pages/decks/deck-analysis-documents"

const mocks = vi.hoisted(() => ({
  analyzeDeck: vi.fn(),
  showToast: vi.fn(),
  job: null as { id: string; status: string; deck: { id: string } } | null,
  statusError: undefined as Error | undefined,
  refetch: vi.fn(() => Promise.resolve()),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [mocks.analyzeDeck, { loading: false }],
  useQuery: (document: unknown) => ({
    data: document === DeckAnalysisJobDocument ? { deckAnalysisJob: mocks.job } : undefined,
    error: mocks.statusError,
    loading: false,
    refetch: mocks.refetch,
    startPolling: mocks.startPolling,
    stopPolling: mocks.stopPolling,
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
  mocks.job = null
  mocks.statusError = undefined
  mocks.refetch.mockClear()
  mocks.startPolling.mockClear()
  mocks.stopPolling.mockClear()
})

function renderHeader(shareMode: boolean, onCombos = () => undefined, status = "active") {
  const noOp = () => undefined

  render(
    <DeckDetailHeader
      canEdit={true}
      deck={
        {
          id: "deck-1",
          name: "Counter Deck",
          format: "commander",
          status,
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

test("AI deck analysis acknowledges queueing without claiming generation is complete", async () => {
  const user = userEvent.setup()
  mocks.analyzeDeck.mockImplementation(({ onCompleted }: { onCompleted?: () => void }) => {
    onCompleted?.()
    return Promise.resolve()
  })
  renderHeader(false)

  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  await user.click(screen.getByRole("menuitem", { name: "Analyze deck with AI" }))

  expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
    "Analysis queued for Counter Deck. You can leave this page.",
    { id: "deck-analysis-deck-1", tone: "info" },
  )
})

test("reopening a pending deck shows progress and disables duplicate analysis", async () => {
  mocks.job = { id: "job-1", status: "pending", deck: { id: "deck-1" } }
  const user = userEvent.setup()
  renderHeader(false)

  expect(screen.getByRole("status").textContent).toContain("Analyzing in the background")
  expect(mocks.startPolling).toHaveBeenCalledWith(2_000)
  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  const action = screen.getByRole("menuitem", { name: "Analyzing..." })
  expect(action.getAttribute("aria-disabled")).toBe("true")
  expect(mocks.analyzeDeck).not.toHaveBeenCalled()
})

test("a status connection failure offers a status check, not another paid analysis", async () => {
  mocks.job = { id: "job-1", status: "pending", deck: { id: "deck-1" } }
  mocks.statusError = new Error("Network unavailable")
  const user = userEvent.setup()
  renderHeader(false)

  expect(screen.getByRole("status").textContent).toContain("It may still be running")
  await user.click(screen.getByRole("button", { name: "Check status" }))
  expect(mocks.refetch).toHaveBeenCalledOnce()
  expect(mocks.analyzeDeck).not.toHaveBeenCalled()
  expect(mocks.showToast).not.toHaveBeenCalled()
})

test("a terminal job failure remains visible after reopening the deck", () => {
  mocks.job = { id: "job-1", status: "failed", deck: { id: "deck-1" } }
  renderHeader(false)

  expect(screen.getByRole("status").textContent).toContain("AI analysis could not be completed")
  expect(screen.getByRole("button", { name: "Retry analysis" })).toBeInstanceOf(HTMLElement)
  expect(mocks.startPolling).not.toHaveBeenCalled()
  expect(mocks.showToast).not.toHaveBeenCalled()
})

test("archived decks do not offer AI analysis", async () => {
  mocks.job = { id: "job-1", status: "failed", deck: { id: "deck-1" } }
  const user = userEvent.setup()
  renderHeader(false, () => undefined, "archived")

  expect(screen.queryByRole("button", { name: "Retry analysis" })).toBeNull()
  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  expect(screen.queryByRole("menuitem", { name: "Analyze deck with AI" })).toBeNull()
})

test("private deck menu opens the infinite combo lookup", async () => {
  const user = userEvent.setup()
  const onCombos = vi.fn()
  renderHeader(false, onCombos)

  await user.click(screen.getByRole("button", { name: "Counter Deck actions" }))
  await user.click(screen.getByRole("menuitem", { name: "Infinite combos" }))

  expect(onCombos).toHaveBeenCalledTimes(1)
})
