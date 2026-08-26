import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import type { DeckSummary } from "../src/pages/decks/deck-types"
import { DeckPlayHistory, RandomDeckDialog } from "../src/pages/decks/deck-picker"
import { RandomDeckDocument, RecordDeckPlayDocument } from "../src/pages/decks/queries"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { id: string } }) => (
    <a href={`/decks/${params.id}`}>{children}</a>
  ),
}))

afterEach(cleanup)

test("skipping records the outcome and offers a different deck before choosing", async () => {
  const firstDeck = randomDeck("deck-1", "First Deck")
  const secondDeck = randomDeck("deck-2", "Second Deck")
  const onOpenChange = vi.fn()
  const onRecorded = vi.fn()

  renderDialog(
    [
      randomDeckMock(null, firstDeck),
      recordDeckMock("deck-1", "SKIPPED", { ...firstDeck, skipCount: 1 }),
      randomDeckMock("deck-1", secondDeck),
      recordDeckMock("deck-2", "PLAYED", {
        ...secondDeck,
        playCount: 1,
        lastPlayedAt: "2026-08-26T12:00:00Z",
      }),
    ],
    { onOpenChange, onRecorded },
  )

  expect(await screen.findByText("First Deck")).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "Skip" }))

  expect(await screen.findByText("Second Deck")).toBeTruthy()
  expect(onRecorded).toHaveBeenCalledTimes(1)

  await userEvent.click(screen.getByRole("button", { name: "Play this deck" }))

  expect(await screen.findByText("Second Deck marked as played")).toBeTruthy()
  expect(onRecorded).toHaveBeenCalledTimes(2)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("a single playable deck can be skipped and offered again", async () => {
  const onlyDeck = randomDeck("deck-1", "Only Deck")

  renderDialog([
    randomDeckMock(null, onlyDeck),
    recordDeckMock("deck-1", "SKIPPED", { ...onlyDeck, skipCount: 1 }),
    randomDeckMock("deck-1", { ...onlyDeck, skipCount: 1 }),
    recordDeckMock("deck-1", "SKIPPED", { ...onlyDeck, skipCount: 2 }),
    randomDeckMock("deck-1", { ...onlyDeck, skipCount: 2 }),
  ])

  expect(await screen.findByText("Only Deck")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Skip" }))

  expect(await screen.findByText("0 plays · 1 skip")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Skip" }))

  expect(await screen.findByText("0 plays · 2 skips")).toBeTruthy()
  expect((screen.getByRole("button", { name: "Skip" }) as HTMLButtonElement).disabled).toBe(false)
})

test("the picker explains when no active decks are available", async () => {
  renderDialog([randomDeckMock(null, null)])

  expect(await screen.findByText("No decks are ready to pick")).toBeTruthy()
  expect((screen.getByRole("button", { name: "Skip" }) as HTMLButtonElement).disabled).toBe(true)
  expect(
    (screen.getByRole("button", { name: "Play this deck" }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

test("play history is collapsed and breaks down every active deck", async () => {
  const decks = [
    deckSummary({
      id: "deck-1",
      name: "Never Played",
      playCount: 0,
      skipCount: 2,
      lastPlayedAt: null,
    }),
    deckSummary({
      id: "deck-2",
      name: "Recent Deck",
      playCount: 3,
      skipCount: 1,
      lastPlayedAt: "2026-08-25T12:00:00Z",
    }),
  ]

  render(<DeckPlayHistory decks={decks} />)

  const details = screen.getByText("Play history").closest("details")
  expect(details?.open).toBe(false)
  expect(screen.getByText("3 plays")).toBeTruthy()

  await userEvent.click(within(details as HTMLElement).getByText("Play history"))

  const rows = within(screen.getByRole("table", { name: "Play and skip history for active decks" }))
    .getAllByRole("row")
    .slice(1)

  expect(rows).toHaveLength(2)
  expect(rows[0]?.textContent).toContain("Recent Deck")
  expect(rows[0]?.textContent).toContain("3")
  expect(rows[0]?.textContent).toContain("1")
  expect(rows[1]?.textContent).toContain("Never Played")
  expect(rows[1]?.textContent).toContain("Never")
})

function renderDialog(
  mocks: ConstructorParameters<typeof MockLink>[0],
  callbacks: { onOpenChange?: (open: boolean) => void; onRecorded?: () => void } = {},
) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) })

  return render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <RandomDeckDialog
          open={true}
          onOpenChange={callbacks.onOpenChange || (() => undefined)}
          onRecorded={callbacks.onRecorded || (() => undefined)}
        />
      </ToastProvider>
    </ApolloProvider>,
  )
}

function randomDeckMock(excludeId: string | null, deck: ReturnType<typeof randomDeck> | null) {
  return {
    request: { query: RandomDeckDocument, variables: { excludeId } },
    result: { data: { randomDeck: deck } },
  }
}

function recordDeckMock(
  id: string,
  outcome: "PLAYED" | "SKIPPED",
  deck: ReturnType<typeof randomDeck>,
) {
  return {
    request: { query: RecordDeckPlayDocument, variables: { id, outcome } },
    result: {
      data: {
        recordDeckPlay: {
          deck: {
            id: deck.id,
            playCount: deck.playCount,
            skipCount: deck.skipCount,
            lastPlayedAt: deck.lastPlayedAt,
          },
        },
      },
    },
  }
}

function randomDeck(id: string, name: string) {
  return {
    id,
    name,
    format: "commander",
    status: "active",
    coverImageUrl: null,
    commanderColorIdentity: ["U"],
    cardCount: 100,
    playCount: 0,
    skipCount: 0,
    lastPlayedAt: null as string | null,
  }
}

function deckSummary(overrides: Partial<DeckSummary>): DeckSummary {
  return {
    id: "deck",
    name: "Deck",
    format: "commander",
    status: "active",
    playCount: 0,
    skipCount: 0,
    lastPlayedAt: null,
    primer: null,
    aiAnalysis: null,
    aiAnalysisModel: null,
    aiAnalyzedAt: null,
    commanderBracket: null,
    commanderBracketEstimate: null,
    shareToken: null,
    coverDeckCardId: null,
    coverImageUrl: null,
    commanderColorIdentity: [],
    cardCount: 0,
    legality: { status: "legal", issues: [] },
    ...overrides,
  }
}
