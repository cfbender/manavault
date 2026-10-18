import { createContext, useContext } from "react"
import type { PlaytestAppearance } from "./types"

export const AppearanceContext = createContext<PlaytestAppearance>({})

export function useAppearance() {
  return useContext(AppearanceContext)
}

/** Scryfall's symbol file name for a mana symbol: `{2/W}` becomes `2W`. */
export function manaSymbolName(symbol: string) {
  return symbol.replace(/[{}/]/g, "").toUpperCase()
}
