import { print } from "graphql"
import { describe, expect, it } from "vitest"

import {
  AllocateDeckCardItemDocument,
  AllocateDeckCardProxyDocument,
  DeallocateDeckCardItemDocument,
  DeallocateDeckCardProxyDocument,
} from "../src/pages/decks/deck-allocation-documents"

describe("deck allocation requests", () => {
  it.each([
    ["allocate item", AllocateDeckCardItemDocument],
    ["deallocate item", DeallocateDeckCardItemDocument],
    ["allocate proxy", AllocateDeckCardProxyDocument],
    ["deallocate proxy", DeallocateDeckCardProxyDocument],
  ])("%s sends the allocation fragment without client-only directives", (_, document) => {
    const query = print(document)

    expect(query).not.toContain("@_unmask")
    expect(query).toContain("...DeckCardAllocation")
    expect(query).toContain("fragment DeckCardAllocation on DeckCardAllocationStatus")
  })
})
