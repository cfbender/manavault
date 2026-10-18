import { createPlaytestState, DeckPlaytester } from "@cfbender/playtest"
import { useMemo, type ReactNode } from "react"
import { deckPlaytestCards, deckPlaytestTokens } from "./deck-card-model"
import type { DeckCardEntry } from "./deck-types"

const manaSymbolUrl = (symbol: string) => `/scryfall-assets/symbols/${symbol}.svg`

/** The shared playtester, dealt from a ManaVault deck, autosaved per deck, in the ManaVault sleeve. */
export function ManaVaultDeckPlaytester({
  closeSlot,
  deckCards,
  deckId,
  deckName,
}: {
  closeSlot: ReactNode
  deckCards: DeckCardEntry[]
  deckId: string
  deckName: string
}) {
  // Memoized so parent re-renders don't deal a new game.
  const initialState = useMemo(() => {
    const playtestCards = deckPlaytestCards(deckCards)
    return createPlaytestState(playtestCards.library, playtestCards.command)
  }, [deckCards])
  const tokenOptions = useMemo(() => deckPlaytestTokens(deckCards), [deckCards])

  return (
    <DeckPlaytester
      closeSlot={closeSlot}
      initialState={initialState}
      manaSymbolUrl={manaSymbolUrl}
      saveKey={`manavault:playtest:${deckId}`}
      settingsKey="manavault:playtest-settings"
      sleeveImageUrl="/images/logo.png"
      title={deckName}
      tokenOptions={tokenOptions}
    />
  )
}
