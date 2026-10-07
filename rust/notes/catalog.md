# Catalog (read side) and token items

## Ported

| Elixir                                                                                                           | Rust                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Catalog.Card`, `Card.token/0`, `non_token/0`                                                                    | `catalog::card` (`CardRecord`, `card_query!`, `NON_TOKEN_SQL`, `TOKEN_SQL`, GraphQL `Card`)                                 |
| `Catalog.Printing`, `CardFields` image/price resolvers                                                           | `catalog::printing` (`PrintingRecord`, `printing_query!`, GraphQL `Printing`)                                               |
| `Catalog.Price`, `PriceFragments`, `Finishes` (fallback order)                                                   | `catalog::price` (in-memory + SQL builders `price_sql`, `price_value_sql`, `price_cents_sql`)                               |
| `Catalog.Dataloader` (printings with owned counts, card, produced tokens)                                        | `catalog::loader` (`DataLoader<CatalogLoader>`, registered in `graphql::build_schema`)                                      |
| `Catalog.Cache` / `Cached` (catalog tag)                                                                         | `catalog::cache` (generation-keyed entries in `state.cache`)                                                                |
| `Scryfall.Rulings`, `Cached.card_rulings/2`                                                                      | `catalog::scryfall::rulings`                                                                                                |
| `ScryfallQuery` + `Parser`/`Tokenizer`/`Serializer`                                                              | `catalog::scryfall_query`                                                                                                   |
| `Search.Cards` (+ `Filter`, `Text/Color/ScalarPredicates`, `Values`), shared `Search.ScalarPredicates`           | `catalog::search::cards`, `catalog::search::predicates` (fragments over `c`/`p` aliases; reusable by the collection search) |
| `Search.NameMatch`                                                                                               | `catalog::search::name_match`                                                                                               |
| `Search.CardNameSuggestions`                                                                                     | `catalog::search::suggestions`                                                                                              |
| `Search.CardsByName` (+ `Decklists.normalize_card_name/1`)                                                       | `catalog::search::cards_by_name`                                                                                            |
| `Search.Printings`                                                                                               | `catalog::search::printings`                                                                                                |
| `EDHRec.card_page/2`, `Client.fetch_card_page/1`, `Response.CardPage`, `Response.CardLookup` (card lookup parts) | `catalog::edhrec`                                                                                                           |
| `CardTypes`, `CardOperations`, card parts of `QueryResolvers`                                                    | `catalog::schema::CardQueries`                                                                                              |
| `Catalog.TokenItem`, `Tokens.*` (`Items`, `Produced`, `SearchPrintings`, `BackOptions`, `KnownBacks`)            | `tokens::{items, produced, search, back_options, known_backs}`                                                              |
| `TokenTypes`, `TokenOperations`, `TokenResolvers`                                                                | `tokens::schema::{TokenQueries, TokenMutations}`                                                                            |

`catalog::invalidate_after_import(state)` drops the name-suggestion index and
bumps the catalog cache generation (rulings).

For other domains: `Card::load`, `Card::load_with_printings`, `Card::load_many`,
`Printing::load`, `Printing::load_many`, `printing::with_cards`,
`printing::owned_counts`, `printing::printings_with_owned_counts`,
`card::load_records`, `cards_by_name::{find, by_names, key}`,
`search::printings::{search_printings, get_printing, list_printings_for_oracle_id}`,
`price::*`, `tokens::items::owned_token_counts`, `tokens::produced::by_oracle_ids`.
`Card`/`Printing` resolve their nested printings/card/produced tokens through
the data loader when the schema registers it (public share schema: add
`.data(catalog::loader::data_loader(pool))`), else with direct queries.

## GraphQL

Types: `Card`, `Printing`, `ScryfallOracleTag`, `CardRuling`, `CardLegality`,
`ProducedToken`, `SetSuggestion`, `CardConnection`/`CardEdge`,
`PrintingConnection`/`PrintingEdge`, `CardSort`, `CardTokenScope`,
`CardEdhrec`/`CardEdhrecSection`/`CardEdhrecEntry`, `TokenItem`,
`TokenItemInput`, `TokenItemUpdateInput`, `TokenBackOptions`, and the four
token payloads.

Queries: `cards`, `cardNameSuggestions`, `setSuggestions`, `card`, `cardByName`,
`scannerPrintings`, `scannerSetIllustrations`, `cardEdhrec`, `tokenItems`,
`tokenItemCount`, `tokenPrintings`, `tokenBackOptions`.

Mutations: `addTokenItem`, `updateTokenItem`, `deleteTokenItem`, `deleteTokenItems`.

`sdl_diff.py` shows no differences for these except `implements Node` on
`Card`, `Printing`, and `TokenItem`, which appears once the integrator adds the
`Node` interface and root `node` field. Arguments with Absinthe defaults are
`Option` arguments with the default applied in the resolver (the Absinthe SDL
dump prints no defaults).

## Deliberate differences

- Database failures in these resolvers return the GraphQL error
  "Something went wrong." (Elixir raised and returned HTTP 500).
- `updateTokenItem`/`deleteTokenItem` on a missing id return
  "Token item was not found." (Elixir raised `Ecto.NoResultsError`, a 404 page).
- Catalog reads are not cached except rulings (6 h) and the name-suggestion
  index; the Elixir `Cached` wrappers for searches and card-with-printings are
  dropped because SQLite reads are fast and caching owned counts would need
  every collection write to invalidate them.
- The EDHREC JSON host is configurable: `Config::edhrec_json_base_url`
  (`EDHREC_JSON_BASE_URL`, default `https://json.edhrec.com`); deck EDHREC
  features can use it for `/pages/commanders` too.
- `ScryfallQuery` field names that are neither aliases nor canonical field
  names become `Field::Unknown` (Elixir resolved any existing atom).
- `cardEdhrec` entries whose `num_decks`/`potential_decks` are not integers read
  as `null` (Absinthe would fail to serialize them).

## Elixir bugs found (fixed here)

1. `cards` search results left every printing's `ownedCount` at 0 (the preload
   never filled the virtual field). Results now carry real owned counts.
2. `cardEdhrec` returned bare error tuples (`{:edhrec_card_http_error, 404}`),
   which Absinthe cannot render, so EDHREC failures crashed the request. They
   are GraphQL errors worded like `Errors.edhrec_error/1` now.
3. `PriceFragments`' finish-aware vendor subquery accepted any vendor finish
   (it only ordered by the fallback chain), so SQL prices (filters, sorts,
   totals) used e.g. an etched vendor price for a foil item while the
   in-memory price found none. `price_value_sql` limits the subquery to the
   finish's chain.
4. `Cache.external_cached/3` cached the empty list a failed rulings fetch
   returns for six hours; only successful fetches are cached now.

## lotus

No gaps hit. `ScryfallId`/`OracleId` are plain string newtypes (no UUID
validation), which the fixtures rely on.

## Foundation changes

- `Cargo.toml`: async-graphql `dataloader` feature.
- `config.rs`: `edhrec_json_base_url` field (env + tests).
- `graphql/mod.rs`: merged `CardQueries`, `TokenQueries`, `TokenMutations`;
  registered the catalog data loader.
- `test_support.rs`: `fixtures::merge` made public, `fixtures::legal_commander_card`.

## Left undone / for others

- The placeholder import does not write `scryfall_card_tokens`; tests insert
  links with `catalog::tests::link_token` (`INSERT OR IGNORE`, so they keep
  working once the real import writes `all_parts`).
- `Search.Printings.search_printings` and `get_printing` are ported but not
  wired to GraphQL (the collection import/cover search will use them).
- Collection writes that change owned counts need no catalog invalidation
  (owned counts are never cached).
