// Differences between the backends that were investigated and are
// intentional: Elixir bugs that the Rust port fixes on purpose, and places
// where Elixir raised. rust/notes/parity.md has the reasoning for each.
//
// Each entry gets the step label, the list of differing paths, and both
// normalized responses; it must match narrowly (label AND the paths that
// differ) so an unrelated regression in the same step still shows up.

const only = (pattern) => (differences) =>
  differences.every((difference) => pattern.test(difference.path))

const PRINTING_CHOICE =
  /\.(setCode|collectorNumber|unitPriceCents|unitPriceText|totalPriceCents|totalPriceText|estimatedCostCents|estimatedCostText|deckBuylistExport)$|\.printing\.(id|scryfallId|imageUrl|setCode|collectorNumber)$/

export const KNOWN_DIFFERENCES = [
  {
    reason:
      "Elixir raised (HTTP 500, or 404 from Ecto.NoResultsError) where Rust answers with a GraphQL error or, for an explicit null filter object, the unfiltered result (rust/notes/integration.md, parity.md#elixir-raised)",
    match: (_label, _differences, elixir, rust) =>
      (elixir.status === 500 || elixir.status === 404) &&
      rust.status === 200 &&
      !Array.isArray(elixir.errors),
  },
  {
    reason:
      "Changeset errors list fields in map order: Elixir iterates the `traverse_errors` map, whose atom keys follow the VM's atom table (OTP 26+), Rust sorts fields alphabetically; same messages (parity.md#changeset-field-order)",
    match: (_label, differences, elixir, rust) =>
      only(/^\$\.errors\[0\]\.message$/)(differences) &&
      sameFieldMessages(elixir.errors?.[0]?.message, rust.errors?.[0]?.message),
  },
  {
    reason:
      "Elixir bug: cheapest/representative printing ties are broken by comparing `Date` structs in Erlang term order (day before month and year); Rust compares chronologically (rust/notes/trade.md, decks/cards.rs `price_order`)",
    match: (label, differences) =>
      /^(DeckBuylist|CollectionCheck)#\d+ (.*considering=true|cardkingdom|lotus)/.test(label) &&
      only(PRINTING_CHOICE)(differences),
  },
  {
    reason:
      "Elixir bug: CSV import conditions are matched case-sensitively, so `Lightly Played` imports as near mint (rust/notes/collection.md)",
    match: (label, differences) =>
      /capitalized conditions/.test(label) && only(/\.attrs\.condition$/)(differences),
  },
  {
    reason:
      "Elixir bug: deck diff compares `Basic Snow Land` cards by oracle id with the non-basics, so snow basics come first; Rust treats them as basics (rust/notes/trade.md)",
    match: (label, differences) =>
      /^DeckDiff#1$/.test(label) && only(/^\$\.data\.deckDiff\.(changes|cuts)/)(differences),
  },
  {
    reason:
      "Elixir bug: a deck's fallback cover (no cover card chosen) comes from `DeckSummaries.display_summaries/1`, whose `order_by([deck_card, card], ...)` binds the deck, not the card (cover by insertion order instead of card name); Rust uses the card order (decks/contents.rs `cover_image_url`)",
    match: (label, differences) =>
      /^(Deck|Decks|RandomDeck)#/.test(label) && only(/\.coverImageUrl$/)(differences),
  },
  {
    reason:
      "Elixir bug: the value-gain group sort splices `price - COALESCE(purchase, price)` into `quantity * ...` without parentheses, so multi-copy groups sort by `quantity * price - purchase`; Rust sorts by the real gain (collection/filters.rs `groups_order`)",
    match: (label, differences) =>
      /sort value_gain/.test(label) &&
      only(/^\$\.data\.collectionItemGroups\.edges(\.length|\[\d+\]\.node\..*)$/)(differences),
  },
]

KNOWN_DIFFERENCES.push({
  reason:
    "Elixir bug: an import row whose printing was picked from the candidates carries the candidate's Printing global id (`selectCandidate` in use-collection-import.ts); Elixir does not decode it and rejects the import, Rust decodes it (collection/graphql/inputs.rs `raw_id_change`)",
  match: (label, _differences, elixir, rust) =>
    /chosen candidates/.test(label) &&
    elixir.errors?.[0]?.message ===
      "A card printing in this import no longer exists. Preview the import again." &&
    !rust.errors,
})

export const NONDETERMINISTIC = []

export const NOT_EXERCISED = {
  ServerLog:
    "GraphQL subscription over the graphql-ws websocket; not reachable over HTTP POST (covered by the server websocket tests).",
}

function sameFieldMessages(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left === right) return false
  const groups = (message) => message.split(/, (?=[a-z_]+ )/).sort()
  return JSON.stringify(groups(left)) === JSON.stringify(groups(right))
}
