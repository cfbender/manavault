import type { TokenItem } from "../types"

/** "Treasure // Soldier" for a double-sided token, otherwise the token's name. */
export function tokenItemName(item: Pick<TokenItem, "printing" | "backPrinting">) {
  const front = item.printing.card?.name ?? "Token"
  const back = item.backPrinting?.card?.name
  return back ? `${front} // ${back}` : front
}
