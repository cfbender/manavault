import { Database, ShoppingCart, Store } from "lucide-react"

import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { manaPoolBuylistUrl, tcgplayerBuylistUrl, vendorBuylistPipeText } from "./buylist-export"
import type { BuylistEntry } from "./deck-types"

export function BuylistMarketplaceActions({
  className,
  entries,
}: {
  className?: string
  entries: BuylistEntry[]
}) {
  const hasBuylistEntries = entries.length > 0

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <form
        action="https://www.cardkingdom.com/builder"
        method="post"
        target="_blank"
        className="inline-flex"
      >
        <input type="hidden" name="c" value={vendorBuylistPipeText(entries)} />
        <input type="hidden" name="partner" value="manavault" />
        <input type="hidden" name="po_origin" value="1" />
        <input type="hidden" name="partner_args" value="manavault,buylist" />
        <Button type="submit" variant="outline" size="sm" disabled={!hasBuylistEntries}>
          <Store className="h-4 w-4" />
          Card Kingdom
        </Button>
      </form>

      {hasBuylistEntries ? (
        <Button asChild variant="outline" size="sm">
          <a href={manaPoolBuylistUrl(entries)} target="_blank" rel="noreferrer">
            <Database className="h-4 w-4" />
            Mana Pool
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          <Database className="h-4 w-4" />
          Mana Pool
        </Button>
      )}

      {hasBuylistEntries ? (
        <Button asChild variant="outline" size="sm">
          <a href={tcgplayerBuylistUrl(entries)} target="_blank" rel="noreferrer">
            <ShoppingCart className="h-4 w-4" />
            TCGplayer
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          <ShoppingCart className="h-4 w-4" />
          TCGplayer
        </Button>
      )}
    </div>
  )
}
