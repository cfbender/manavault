import type { PlaytestCard } from "./engine"
import type { BattlefieldCardPosition, CardStatus, PlayerCounters, PlaytestSnapshot } from "./types"

/** A face-down card as other players see it: no name, image, or deck identity. */
export type HiddenPlaytestCard = { hidden: true; id: string }

export type PublicPlaytestCard = PlaytestCard | HiddenPlaytestCard

/**
 * What other players may see of a game: hands and libraries are counts, and face-down cards are
 * anonymous. Statuses, positions, and tapped ids are keyed by the public card ids.
 */
export type PublicPlaytestSnapshot = {
  battlefield: PublicPlaytestCard[]
  battlefieldCardPositions: Record<string, BattlefieldCardPosition>
  cardStatuses: Record<string, CardStatus>
  command: PublicPlaytestCard[]
  exile: PublicPlaytestCard[]
  graveyard: PublicPlaytestCard[]
  handCount: number
  libraryCount: number
  lifeTotal: number
  mulligans: number
  openingHand: boolean
  playerCounters: PlayerCounters
  tappedCardIds: string[]
  turn: number
}

const PUBLIC_ZONES = ["battlefield", "command", "exile", "graveyard"] as const

export function isHiddenCard(card: PublicPlaytestCard): card is HiddenPlaytestCard {
  return "hidden" in card && card.hidden === true
}

/** Strips a snapshot down to public information, safe to send to other players. */
export function projectPublicSnapshot(snapshot: PlaytestSnapshot): PublicPlaytestSnapshot {
  const { cardStatuses, state } = snapshot
  const tapped = new Set(snapshot.tappedCardIds)
  const positions: Record<string, BattlefieldCardPosition> = {}
  const statuses: Record<string, CardStatus> = {}
  const tappedCardIds: string[] = []

  const project = (zone: (typeof PUBLIC_ZONES)[number]) => {
    const cards = state[zone]
    // Zones keep their newest card first. Numbering face-down cards from the oldest keeps each
    // one's public id stable while newer cards arrive.
    const publicIds: string[] = []
    let faceDownCount = 0
    for (let index = cards.length - 1; index >= 0; index -= 1) {
      const card = cards[index]
      publicIds[index] = cardStatuses[card.id]?.faceDown
        ? `${zone}-face-down-${(faceDownCount += 1)}`
        : card.id
    }

    return cards.map((card, index): PublicPlaytestCard => {
      const id = publicIds[index]
      const status = cardStatuses[card.id]
      if (status) statuses[id] = { ...status }
      if (zone === "battlefield") {
        const position = snapshot.battlefieldCardPositions[card.id]
        if (position) positions[id] = { x: position.x, y: position.y }
        if (tapped.has(card.id)) tappedCardIds.push(id)
      }
      return id === card.id ? card : { hidden: true, id }
    })
  }

  return {
    battlefield: project("battlefield"),
    battlefieldCardPositions: positions,
    cardStatuses: statuses,
    command: project("command"),
    exile: project("exile"),
    graveyard: project("graveyard"),
    handCount: state.hand.length,
    libraryCount: state.library.length,
    lifeTotal: snapshot.lifeTotal,
    mulligans: state.mulligans,
    openingHand: snapshot.openingHand,
    playerCounters: { ...snapshot.playerCounters },
    tappedCardIds,
    turn: snapshot.turn,
  }
}
