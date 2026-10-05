import { useQuery } from "@apollo/client/react"
import { graphql } from "../gql"
import { cn } from "../lib/utils"
import { TokenPrintingGrid, type TokenPrintingOption } from "./token-printing-grid"

export const TokenBackOptionsDocument = graphql(`
  query TokenBackOptions($scryfallId: ID!) {
    tokenBackOptions(scryfallId: $scryfallId) {
      known {
        ...TokenBackOptionFields
      }
      sameSet {
        ...TokenBackOptionFields
      }
    }
  }

  fragment TokenBackOptionFields on Printing {
    id
    scryfallId
    setCode
    collectorNumber
    imageUrl
    card {
      id
      name
      typeLine
    }
  }
`)

/**
 * Back-face candidates for a single-faced token printing. Wizards prints tokens in fixed
 * front/back combinations, so when a pairing is known the handful of real backs come first.
 * The published pairings are incomplete (galleries list one product's pairing per face, and
 * bundles or decks pair differently), so the rest of the set always stays visible below.
 */
export function useTokenBackOptions(scryfallId: string, { skip = false } = {}) {
  const { data, loading, error } = useQuery(TokenBackOptionsDocument, {
    variables: { scryfallId },
    skip,
  })
  const known: readonly TokenPrintingOption[] = data?.tokenBackOptions.known ?? []
  const sameSet: readonly TokenPrintingOption[] = data?.tokenBackOptions.sameSet ?? []
  return { known, sameSet, loading, error, isEmpty: known.length === 0 && sameSet.length === 0 }
}

export function TokenBackFaceOptions({
  className,
  columnsClassName,
  known,
  onPick,
  sameSet,
  selectedScryfallId,
  setCode,
}: {
  className?: string
  columnsClassName?: string
  known: readonly TokenPrintingOption[]
  onPick: (option: TokenPrintingOption) => void
  sameSet: readonly TokenPrintingOption[]
  selectedScryfallId?: string | null
  setCode: string
}) {
  if (known.length === 0) {
    return (
      <TokenPrintingGrid
        className={className}
        columnsClassName={columnsClassName}
        options={sameSet}
        selectedScryfallId={selectedScryfallId}
        onPick={onPick}
      />
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <section aria-labelledby="token-back-known-heading" className="space-y-2">
        <h3
          id="token-back-known-heading"
          className="text-xs font-black uppercase tracking-[0.18em] text-accent"
        >
          Known backs
        </h3>
        <TokenPrintingGrid
          columnsClassName={columnsClassName}
          options={known}
          selectedScryfallId={selectedScryfallId}
          onPick={onPick}
        />
      </section>
      {sameSet.length > 0 ? (
        <section
          aria-labelledby="token-back-same-set-heading"
          className="space-y-2 border-t border-base-300/70 pt-3"
        >
          <h3
            id="token-back-same-set-heading"
            className="text-xs font-black uppercase tracking-[0.18em] text-base-content/60"
          >
            Other {setCode.toUpperCase()} tokens
          </h3>
          <TokenPrintingGrid
            columnsClassName={columnsClassName}
            options={sameSet}
            selectedScryfallId={selectedScryfallId}
            onPick={onPick}
          />
        </section>
      ) : null}
    </div>
  )
}
