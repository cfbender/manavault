export type PlaytestZone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command"

export type PlaytestCard = {
  id: string
  deckCardId: string
  imageUrl?: string | null
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

  return {
    ...state,
    graveyard: [...state.graveyard, ...state.library.slice(0, millCount)],
    library: state.library.slice(millCount),
  }
}

export function exileFromLibrary(state: PlaytestState, count: number): PlaytestState {
  const exileCount = Math.min(Math.max(count, 0), state.library.length)
  if (exileCount === 0) return state

  return {
    ...state,
    exile: [...state.exile, ...state.library.slice(0, exileCount)],
    library: state.library.slice(exileCount),
  }
}

export function movePlaytestCard(
  state: PlaytestState,
  from: PlaytestZone,
  to: PlaytestZone,
  cardId: string,
  placement: "top" | "bottom" = "top",
): PlaytestState {
  if (from === to) return state

  const source = state[from]
  const cardIndex = source.findIndex((card) => card.id === cardId)
  if (cardIndex === -1) return state

  const card = source[cardIndex]
  const nextSource = [...source.slice(0, cardIndex), ...source.slice(cardIndex + 1)]
  const nextTarget =
    to === "library" && placement === "bottom" ? [...state[to], card] : [card, ...state[to]]

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
