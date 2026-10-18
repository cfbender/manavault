import { describe, expect, test } from "vitest"
import type { PlaytestCard, PlaytestState } from "../src/engine"
import { isHiddenCard, projectPublicSnapshot } from "../src/public-snapshot"
import { initialSnapshot } from "../src/snapshot"
import type { PlaytestSnapshot } from "../src/types"

function card(name: string): PlaytestCard {
  const slug = name.toLowerCase().replaceAll(" ", "-")
  return {
    deckCardId: `deck-${slug}`,
    id: `${slug}:0`,
    imageUrl: `https://cards.example/${slug}.jpg`,
    manaCost: "{1}{U}",
    name,
    setLabel: `SET #${slug}`,
    typeLine: `Creature — ${name}`,
  }
}

const handCards = [card("Hidden Hand Alpha"), card("Hidden Hand Beta")]
const libraryCards = [
  card("Hidden Library One"),
  card("Hidden Library Two"),
  card("Hidden Library Three"),
]
const morph = card("Hidden Morph")
const bear = card("Visible Bear")
const graveCard = card("Visible Grave")
const commander = card("Visible Commander")

function gameSnapshot(library = libraryCards): PlaytestSnapshot {
  const state: PlaytestState = {
    battlefield: [morph, bear],
    command: [commander],
    exile: [],
    graveyard: [graveCard],
    hand: handCards,
    handSize: 7,
    library,
    mulligans: 1,
  }
  return {
    ...initialSnapshot(state),
    battlefieldCardPositions: {
      [bear.id]: { x: 200, y: 40 },
      [morph.id]: { x: 48, y: 40 },
      // Left behind by a card that went back to hand: must not reveal it.
      [handCards[0].id]: { x: 300, y: 300 },
    },
    cardStatuses: {
      [handCards[1].id]: { markers: 1, minusOneCounters: 0, plusOneCounters: 0 },
      [morph.id]: { faceDown: true, markers: 0, minusOneCounters: 0, plusOneCounters: 2 },
    },
    lifeTotal: 33,
    openingHand: false,
    tappedCardIds: [morph.id, handCards[0].id],
    turn: 5,
  }
}

const hiddenCards = [...handCards, ...libraryCards, morph]

describe("projectPublicSnapshot", () => {
  test("never reveals hand, library, or face-down cards", () => {
    const json = JSON.stringify(projectPublicSnapshot(gameSnapshot()))

    for (const hidden of hiddenCards) {
      for (const secret of [
        hidden.id,
        hidden.deckCardId,
        hidden.name,
        hidden.imageUrl,
        hidden.setLabel,
        hidden.typeLine,
      ]) {
        expect(json).not.toContain(secret)
      }
    }
  })

  test("turns the hand and library into counts, ignoring library order", () => {
    const projection = projectPublicSnapshot(gameSnapshot())
    const reordered = projectPublicSnapshot(gameSnapshot([...libraryCards].reverse()))

    expect(projection.handCount).toBe(2)
    expect(projection.libraryCount).toBe(3)
    expect(reordered).toEqual(projection)
  })

  test("keeps a face-down permanent's place, tap state, and counters under an anonymous id", () => {
    const projection = projectPublicSnapshot(gameSnapshot())
    const [faceDown, visible] = projection.battlefield

    expect(isHiddenCard(faceDown)).toBe(true)
    expect(faceDown).toEqual({ hidden: true, id: faceDown.id })
    expect(projection.battlefieldCardPositions[faceDown.id]).toEqual({ x: 48, y: 40 })
    expect(projection.tappedCardIds).toEqual([faceDown.id])
    expect(projection.cardStatuses[faceDown.id]).toMatchObject({
      faceDown: true,
      plusOneCounters: 2,
    })
    expect(visible).toEqual(bear)
    expect(projection.battlefieldCardPositions[bear.id]).toEqual({ x: 200, y: 40 })
  })

  test("a face-down card keeps its public id when newer cards arrive", () => {
    const snapshot = gameSnapshot()
    const before = projectPublicSnapshot(snapshot).battlefield[0].id
    const newMorph = card("Second Morph")
    const after = projectPublicSnapshot({
      ...snapshot,
      cardStatuses: {
        ...snapshot.cardStatuses,
        [newMorph.id]: { faceDown: true, markers: 0, minusOneCounters: 0, plusOneCounters: 0 },
      },
      state: { ...snapshot.state, battlefield: [newMorph, ...snapshot.state.battlefield] },
    })

    expect(after.battlefield[1].id).toBe(before)
    expect(after.battlefield[0].id).not.toBe(before)
    expect(JSON.stringify(after)).not.toContain("Second Morph")
  })

  test("shares public zones and player state as they are", () => {
    const projection = projectPublicSnapshot(gameSnapshot())

    expect(projection.graveyard).toEqual([graveCard])
    expect(projection.command).toEqual([commander])
    expect(projection).toMatchObject({ lifeTotal: 33, mulligans: 1, openingHand: false, turn: 5 })
  })
})
