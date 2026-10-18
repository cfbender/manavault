export type PlaytestZone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command"

export type PlaytestCard = {
  id: string
  deckCardId: string
  imageUrl?: string | null
  manaCost?: string | null
  name: string
  setLabel?: string | null
  typeLine?: string | null
}

export type PlaytestState = {
  battlefield: PlaytestCard[]
  command: PlaytestCard[]
  exile: PlaytestCard[]
  graveyard: PlaytestCard[]
  hand: PlaytestCard[]
  handSize: number
  library: PlaytestCard[]
  mulligans: number
}

type CreatePlaytestStateOptions = {
  handSize?: number
  mulligans?: number
  random?: () => number
}

export function createPlaytestState(
  libraryCards: PlaytestCard[],
  commandCards: PlaytestCard[] = [],
  { handSize = 7, mulligans = 0, random = Math.random }: CreatePlaytestStateOptions = {},
): PlaytestState {
  const library = shuffleCards(libraryCards, random)
  const drawCount = Math.min(Math.max(handSize, 0), library.length)

  return {
    battlefield: [],
    command: commandCards,
    exile: [],
    graveyard: [],
    hand: library.slice(0, drawCount),
    handSize: drawCount,
    library: library.slice(drawCount),
    mulligans,
  }
}

export function drawCards(state: PlaytestState, count: number): PlaytestState {
  const drawCount = Math.min(Math.max(count, 0), state.library.length)
  if (drawCount === 0) return state

  return {
    ...state,
    hand: [...state.hand, ...state.library.slice(0, drawCount)],
    library: state.library.slice(drawCount),
  }
}

export function millCards(state: PlaytestState, count: number): PlaytestState {
  const millCount = Math.min(Math.max(count, 0), state.library.length)
  if (millCount === 0) return state

  // Zone piles keep their top card at index 0, so the last milled card lands on top.
  return {
    ...state,
    graveyard: [...state.library.slice(0, millCount).reverse(), ...state.graveyard],
    library: state.library.slice(millCount),
  }
}

export function exileFromLibrary(state: PlaytestState, count: number): PlaytestState {
  const exileCount = Math.min(Math.max(count, 0), state.library.length)
  if (exileCount === 0) return state

  return {
    ...state,
    exile: [...state.library.slice(0, exileCount).reverse(), ...state.exile],
    library: state.library.slice(exileCount),
  }
}

export type LibraryTopDecision = "top" | "bottom" | "graveyard"

/** Applies scry/surveil choices for the top cards of the library in one step. */
export function resolveLibraryTop(
  state: PlaytestState,
  decisions: Record<string, LibraryTopDecision>,
): PlaytestState {
  const decided = state.library.filter((card) => decisions[card.id])
  if (decided.length === 0) return state

  const rest = state.library.filter((card) => !decisions[card.id])
  const top = decided.filter((card) => decisions[card.id] === "top")
  const bottom = decided.filter((card) => decisions[card.id] === "bottom")
  const graveyard = decided.filter((card) => decisions[card.id] === "graveyard")

  return {
    ...state,
    graveyard: [...graveyard.reverse(), ...state.graveyard],
    library: [...top, ...rest, ...bottom],
  }
}

/** Moves every card in a zone; library destinations can be shuffled in or placed on the bottom. */
export function moveAllPlaytestCards(
  state: PlaytestState,
  from: PlaytestZone,
  to: PlaytestZone,
  { placement = "top", random = Math.random, shuffle = false }: MoveAllOptions = {},
): PlaytestState {
  if (from === to || state[from].length === 0) return state

  const moved = state[from]
  let target =
    to === "library" && placement === "bottom" ? [...state[to], ...moved] : [...moved, ...state[to]]
  if (to === "library" && shuffle) target = shuffleCards(target, random)

  return { ...state, [from]: [], [to]: target }
}

type MoveAllOptions = {
  placement?: "top" | "bottom"
  random?: () => number
  shuffle?: boolean
}

export function movePlaytestCard(
  state: PlaytestState,
  from: PlaytestZone,
  to: PlaytestZone,
  cardId: string,
  placement: "top" | "bottom" = "top",
): PlaytestState {
  // Library cards may move within the library (to its top or bottom); other same-zone moves are no-ops.
  if (from === to && to !== "library") return state

  const source = state[from]
  const cardIndex = source.findIndex((card) => card.id === cardId)
  if (cardIndex === -1) return state

  const card = source[cardIndex]
  const nextSource = [...source.slice(0, cardIndex), ...source.slice(cardIndex + 1)]
  const targetBase = from === to ? nextSource : state[to]
  const nextTarget =
    to === "library" && placement === "bottom" ? [...targetBase, card] : [card, ...targetBase]

  if (from === to) return { ...state, [to]: nextTarget }

  return {
    ...state,
    [from]: nextSource,
    [to]: nextTarget,
  }
}

export function mulliganPlaytest(state: PlaytestState, random: () => number = Math.random) {
  const nextHandSize = Math.max(state.handSize - (state.mulligans === 0 ? 0 : 1), 0)
  const libraryPool = [
    ...state.library,
    ...state.hand,
    ...state.battlefield,
    ...state.graveyard,
    ...state.exile,
  ]

  return createPlaytestState(libraryPool, state.command, {
    handSize: nextHandSize,
    mulligans: state.mulligans + 1,
    random,
  })
}

export function shuffleLibrary(
  state: PlaytestState,
  random: () => number = Math.random,
): PlaytestState {
  return { ...state, library: shuffleCards(state.library, random) }
}

export function shuffleCards(cards: PlaytestCard[], random: () => number = Math.random) {
  const shuffled = [...cards]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const card = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = card
  }

  return shuffled
}
