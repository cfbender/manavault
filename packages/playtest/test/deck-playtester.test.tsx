import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { DeckPlaytester } from "../src/deck-playtester"
import { createPlaytestState } from "../src/engine"
import { initialSnapshot } from "../src/snapshot"
import type { PlaytestSnapshot } from "../src/types"

afterEach(cleanup)

const cards = Array.from({ length: 12 }, (_, index) => ({
  deckCardId: `deck-card-${index}`,
  id: `deck-card-${index}:0`,
  name: `Card ${index}`,
}))
const initialState = createPlaytestState(cards)

test("a controlled playtester reports changes and shows only the snapshot it is given", () => {
  const onSnapshotChange = vi.fn<(snapshot: PlaytestSnapshot) => void>()
  const snapshot = initialSnapshot(initialState)
  const { rerender } = render(
    <DeckPlaytester
      initialState={initialState}
      onSnapshotChange={onSnapshotChange}
      snapshot={snapshot}
      title="Test deck"
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: /Keep 7/ }))

  expect(onSnapshotChange).toHaveBeenCalledTimes(1)
  const kept = onSnapshotChange.mock.calls[0][0]
  expect(kept).toMatchObject({ openingHand: false, state: snapshot.state })
  // The host hasn't accepted the change yet.
  expect(screen.getByRole("heading", { name: "Opening hand" })).toBeTruthy()

  rerender(
    <DeckPlaytester
      initialState={initialState}
      onSnapshotChange={onSnapshotChange}
      snapshot={kept}
      title="Test deck"
    />,
  )
  expect(screen.queryByRole("heading", { name: "Opening hand" })).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "Undo" }))
  expect(onSnapshotChange).toHaveBeenLastCalledWith(snapshot)
})

test("host-owned life and turn are shown and changed through the host", () => {
  const onLifeChange = vi.fn()
  const onTurnChange = vi.fn()
  const onSnapshotChange = vi.fn<(snapshot: PlaytestSnapshot) => void>()
  render(
    <DeckPlaytester
      initialState={initialState}
      life={{ onChange: onLifeChange, value: 27 }}
      onSnapshotChange={onSnapshotChange}
      playerCounters={null}
      snapshot={{ ...initialSnapshot(initialState), openingHand: false }}
      title="Test deck"
      turn={{ onChange: onTurnChange, value: 6 }}
    />,
  )

  expect(screen.getByRole("group", { name: "Life total" }).textContent).toContain("27")
  fireEvent.click(screen.getByRole("button", { name: "Gain 1 life" }))
  expect(onLifeChange).toHaveBeenCalledWith(28)

  fireEvent.click(screen.getByRole("button", { name: /Next turn/ }))
  expect(onTurnChange).toHaveBeenCalledWith(7)
  // The untap and draw still happen in the snapshot.
  expect(onSnapshotChange.mock.lastCall?.[0].state.hand).toHaveLength(8)
  expect(screen.queryByRole("button", { name: /Counters/ })).toBeNull()
})

test("hidden host values remove their controls", () => {
  render(<DeckPlaytester initialState={initialState} life={null} title="Test deck" turn={null} />)

  expect(screen.queryByRole("group", { name: "Life total" })).toBeNull()
  expect(screen.queryByRole("button", { name: /Next turn/ })).toBeNull()
})
