import { graphql } from "../../gql"
import type { ScannerPrintingsQuery } from "../../gql/graphql"
import { isFinish, type PrintingOption } from "./printing-choice"

export const ScannerPrintingsDocument = graphql(`
  query ScannerPrintings($scryfallId: ID!, $illustrationId: ID) {
    scannerPrintings(scryfallId: $scryfallId, illustrationId: $illustrationId) {
      id
      scryfallId
      setCode
      setName
      collectorNumber
      lang
      rarity
      illustrationId
      ownedCount
      finishes
      promo
      releasedAt
      imageUrl
      backImageUrl
      nonfoilCents: priceCents(finish: "nonfoil")
      foilCents: priceCents(finish: "foil")
      etchedCents: priceCents(finish: "etched")
      card {
        id
        name
        layout
      }
    }
  }
`)

/**
 * Possible other sides of a scanned single-faced token: the other tokens printed in its set.
 * Scryfall lists a Commander precon's double-sided tokens as two single-faced printings.
 */
export const TokenBackPrintingsDocument = graphql(`
  query TokenBackPrintings($setCode: String!, $excludeScryfallId: ID!) {
    tokenPrintings(setCode: $setCode, excludeScryfallId: $excludeScryfallId, limit: 100) {
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
  }
`)

/** "Wrong card?": catalog cards by name, each with a printing to look the card up by. */
export const ScannerCardSearchDocument = graphql(`
  query ScannerCardSearch($q: String!) {
    cards(q: $q, first: 8) {
      edges {
        node {
          id
          name
          typeLine
          primaryPrinting {
            id
            scryfallId
            setCode
            imageUrl
          }
        }
      }
    }
  }
`)

export const ScannerSetIllustrationsDocument = graphql(`
  query ScannerSetIllustrations($setCodes: [String!]!) {
    scannerSetIllustrations(setCodes: $setCodes)
  }
`)

type ScannerPrinting = ScannerPrintingsQuery["scannerPrintings"][number]

export function printingOption(printing: ScannerPrinting): PrintingOption {
  const finishes = (printing.finishes ?? []).filter(isFinish)
  return {
    scryfallId: printing.scryfallId,
    name: printing.card?.name ?? "",
    setCode: printing.setCode ?? "",
    setName: printing.setName,
    collectorNumber: printing.collectorNumber ?? "",
    lang: printing.lang ?? "en",
    rarity: printing.rarity,
    illustrationId: printing.illustrationId,
    ownedCount: printing.ownedCount,
    finishes: finishes.length > 0 ? finishes : ["nonfoil"],
    promo: printing.promo,
    releasedAt: printing.releasedAt,
    imageUrl: printing.imageUrl,
    backImageUrl: printing.backImageUrl,
    layout: printing.card?.layout ?? null,
    // priceCents falls back across finishes; only offer a finish's price if it is printed.
    prices: {
      nonfoil: finishes.includes("nonfoil") ? printing.nonfoilCents : null,
      foil: finishes.includes("foil") ? printing.foilCents : null,
      etched: finishes.includes("etched") ? printing.etchedCents : null,
    },
  }
}
