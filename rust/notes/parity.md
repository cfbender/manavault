# Differential parity testing (Elixir vs Rust)

`rust/scripts/parity/` runs both backends side by side on identical data and
diffs every GraphQL response the React frontend can trigger.

## Running it

```sh
# from the worktree root; needs mise, node >= 22.5 (node:sqlite), unshare
rust/scripts/parity/parity.sh            # offline (default)
rust/scripts/parity/parity.sh --live     # with internet: live EDHREC, Spellbook, Recommander, OpenRouter
rust/scripts/parity/parity.sh --verbose --report /tmp/parity-report.json
```

`parity.sh`:

1. builds `rust/target/debug/manavault` if missing, and on first use copies the
   Elixir app to `ELIXIR_DIR` (default `/tmp/elixir-ref`, without `_build`,
   `node_modules`, databases) with `config :manavault, Oban, queues: false,
plugins: false` appended to `config/prod.exs`, then `MIX_ENV=prod mix
compile`s it;
2. copies `PARITY_SNAPSHOT` (default
   `/home/user/workspace/parity/catalog-snapshot.db`: the full Scryfall
   catalog, 35k cards / 103k printings, Card Kingdom and Mana Pool vendor
   prices) to `ex.db` and `rs.db` under `PARITY_DIR` (default
   `/tmp/parity-run`, recreated on every run);
3. starts Elixir (`MIX_ENV=prod`, port 4100, auth disabled) and Rust
   (`MANAVAULT_ENV=dev`, port 4200, `MANAVAULT_JOBS_DISABLED=1`) with the same
   `SECRET_KEY_BASE`, scanner bundle downloads off, and the public share rate
   limit raised;
4. runs `run.mjs` and stops both servers. Server logs stay in `PARITY_DIR`.

Without `--live` everything runs in a fresh user + network namespace
(`unshare -rn`, loopback only), so external services fail the same way on both
sides (DNS fails; both report "non-existing domain"). Jobs are inserted but
never run on either side (Oban `queues: false`, Rust jobs disabled), so cron
syncs cannot mutate the data mid-run.

Files:

- `operations.mjs`: extracts the 146 operations from
  `assets/react/src/gql/gql.ts`, resolves fragment spreads across documents,
  and adds `__typename` to every selection set (as Apollo's cache does), so
  the documents are byte-for-byte what the browser posts.
- `client.mjs`: session cookie + CSRF token from `GET /settings`, owner
  `POST /api/graphql`, unauthenticated `POST /share/graphql`.
- `scenario.mjs`: the deterministic scenario (557 steps offline): locations,
  collection items (finishes, conditions, languages, locations, trade
  quantities), every collection filter/sort/pagination/group/value/export,
  CSV and text imports with commit and auto-sort preview, auto-sort rules,
  tokens, decks (commander + partner, considering, tags, default tags,
  printings, swaps, legality, decklist import incl. snow basics, share
  tokens), allocation (items, proxies, pull lists, bulk add/deallocate,
  disassembly), buylists in every mode, trade wants/shares/binder,
  collection check, deck diff and trade matches on pasted lists, settings
  (appearance, pricing source switched to Card Kingdom and Mana Pool and
  back, backups, AI, API keys), card search with 27 Scryfall query strings
  and every sort, card detail, scanner, name/set suggestions, public share
  queries (deck, buylist, card, wants, binder) with valid, rotated, disabled
  and bogus tokens, plus validation-error variants of most mutations.
  Variables follow the frontend call sites (global `Printing` ids where the
  UI sends `printing.id`, raw Scryfall ids for trade wants/scanner/token
  backs, `commitImportRow` rows for imports, filter objects rather than
  `null`). Ids returned by a backend are captured per backend.
- `compare.mjs`: normalization and diff. Global ids and database ids are
  compared verbatim (both backends replay the same writes on the same
  database). Masked: `*At` timestamps, ISO timestamps inside strings, share
  tokens and API key secrets (`shareToken`, `token`, `prefix`, and any
  captured token inside strings). Compared exactly: HTTP status, `data`
  (including nulls and list order), `errors[].message` and `errors[].path`
  (not `locations`/`extensions`). JSON key order is ignored (Absinthe's
  encoder sorts keys; the UI does not care).
- `known.mjs`: the investigated, intentional differences (below); each entry
  matches the step label _and_ the differing paths, so a new regression in
  the same step is still reported.
- `one.mjs`: debug helper, runs one operation on both running servers.

Rows with second-precision timestamps tie the same way only if both inserts
land in the same wall-clock second, so steps that create collection items wait
for the start of a second (`alignSecond`). AI settings are validated against
OpenRouter when saved, which is impossible offline, so the scenario writes them
to both databases with `node:sqlite` (both backends read legacy plaintext
keys).

## Result

Offline run (final): 146 operations, 145 exercised, 557 steps; 533 steps
identical, 24 documented differences, 0 unexplained. 127 operations identical
in every call, 18 with documented differences only:

| Operation                                               | Differing steps                                  | Why                                        |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Collection                                              | explicit `filters: null`                         | Elixir raised                              |
| CreateLocation                                          | unknown cover printing                           | Elixir raised                              |
| Location                                                | missing id                                       | Elixir raised (404)                        |
| CreateCollectionItem                                    | unknown printing                                 | Elixir raised                              |
| UpdateCollectionItem                                    | missing id; negative quantity                    | Elixir raised (404); changeset field order |
| CollectionItemGroupsPage                                | `value_gain` asc/desc                            | Elixir bug 1                               |
| PreviewCollectionImport                                 | capitalized CSV conditions                       | Elixir bug (collection.md)                 |
| DeckBuylist                                             | 4 steps (considering, Card Kingdom, Black Lotus) | Elixir bug 4                               |
| Deck                                                    | public share deck without a cover card           | Elixir bug 2                               |
| DeckDiff                                                | snow basics                                      | Elixir bug (trade.md)                      |
| UpdateAppearanceSettings                                | two invalid fields                               | changeset field order                      |
| CollectionCheck                                         | Card Kingdom, Black Lotus                        | date tie-break (trade.md)                  |
| UpdateBackupSettings                                    | unknown provider                                 | Elixir raised (platform.md)                |
| CardEdhrec                                              | EDHREC unreachable                               | Elixir bug 5 (raised)                      |
| DeleteCollectionItem, DeleteDeck                        | deleting twice                                   | Elixir raised (404)                        |
| PreviewCollectionImportAutoSort, CommitCollectionImport | chosen candidate                                 | Elixir bug 3                               |

`--live` run (final): 552 steps, 529 identical, 23 documented, 0
unexplained; live `cardEdhrec`, `deckEdhrec`, `deckCombos` and
`deckRecommander` answers are identical (`deckRecommander` differed before the
float fix below; OpenRouter's "Missing Authentication header" error for the
unvalidated key matches too).

Not exercised: `ServerLog` (a subscription over the Phoenix socket, not
reachable over HTTP POST; covered by the platform socket tests). Not exercised
with real data: cloud backups (only the "no provider" errors), external deck
links (Moxfield/Archidekt sync needs the live sites and real deck ids; only
error paths and the offline failure), OpenRouter answers (only validation,
"not configured", queued jobs, and the offline/unauthorized failures).

## Rust bugs found and fixed

1. **Failed nullable fields dropped** (`graphql/nullable_errors.rs`, foundation):
   async-graphql 7.2 removes a field whose resolver errored from the response
   object, and answers an object whose only field failed with `null`. Every
   failed mutation came back as `{"data": null}` instead of
   `{"data": {"createLocation": null}}`, and a failed query field vanished
   instead of being `null`. The `NullableErrors` extension (registered on the
   owner and public schemas) records the error of a nullable field and
   resolves it to `null`. Tests: `graphql::nullable_errors::tests`,
   `collection::tests::schema::failed_mutations_and_queries_answer_null_fields`.
2. **Transport error text** (`http_errors.rs`): "Could not reach EDHREC: …" /
   "Could not reach Recommander: …" used reqwest's "error sending request for
   url (…)"; Elixir shows the Mint reason (`non-existing domain`,
   `connection refused`, `timeout`, …). Tests: `http_errors::tests`,
   `catalog::tests::edhrec::unreachable_edhrec_reports_the_transport_reason`.
3. **Percent rounding** (`catalog::price::round_tenths`): `valueGainPercentText`
   (and the `$12.3k` thousands) used `(x * 10).round() / 10`, which rounds
   floats stored just below a tie up (`5.35` → `+5.4%`); `Float.round/2`
   rounds the exact value (`+5.3%`). Tests:
   `collection::graphql::values::tests::rounds_the_exact_float_like_float_round`,
   `collection::tests::schema::value_gain_percent_text_rounds_the_exact_float`.
4. **JSON float parsing** (`Cargo.toml`: serde_json `float_roundtrip`): serde_json's
   default best-effort parser read Recommander's `0.9985702037811279` as
   `0.998570203781128`; Jason is exact. Test:
   `deck_intel::tests::deck_recommander_scores_parse_exactly`.

## Elixir bugs found (Rust keeps the correct behavior)

New in this round:

1. **Value-gain group sort** (`ItemQueries.apply_group_sort/2`):
   `sum(item.quantity * value_gain_cents_fragment(...))` splices
   `price - COALESCE(purchase, price)` without parentheses, so groups sort by
   `quantity * price - purchase`. Rust: `collection/filters.rs`
   `groups_order`; test `value_gain_group_sort_multiplies_the_whole_gain`.
2. **Fallback deck cover** (`DeckSummaries.display_summaries/1`):
   `order_by([deck_card, card], asc: card.name)` binds `card` to the joined
   deck, so the cover (when no cover card is chosen) is the first card by zone
   and insertion order, not by name. Affects the owner and public `deck`
   fields. Rust: `decks/contents.rs` `cover_image_url`.
3. **Import candidates** (`ImportResolvers.collection_import_row/2`): the import
   page's `selectCandidate` puts the candidate's `Printing` global id in
   `attrs.scryfallId`; Elixir does not decode it, so committing or
   auto-sort-previewing an import after choosing a printing for an ambiguous
   row always fails ("A card printing in this import no longer exists").
   Rust decodes `Printing` global ids (`collection/graphql/inputs.rs`
   `raw_id_change`); test `import_commit_accepts_a_chosen_candidate_global_id`.
4. **Printing tie-breaks by `Date` term order** in `Decks.Printings`
   (`cheapest_printing/1`, `cheapest_priced_printing/1`, so buylists and
   optimize-printings): same bug as the documented `CollectionCheck` one
   (rust/notes/trade.md); dates compare day first. Rust is chronological
   (`decks/cards.rs` `price_order`, `deck_intel/buylist.rs` `sort_key`).
5. **`cardEdhrec` crashes when EDHREC is unreachable or errors**: the resolver
   returns `{:edhrec_card_request_failed, reason}` (and
   `{:edhrec_card_http_error, status}`) unformatted and Absinthe raises
   `String.Chars` (HTTP 500). Rust answers "Could not reach EDHREC: …".
6. **Explicit `null` arguments crash**: `filters: null` on `collectionItemCount`,
   `collectionItemEntryCount`, `collectionItemGroups`, exports (`Enum` on
   `nil`, HTTP 500), and `zone: null` on `addCollectionItemToDeck` /
   `bulkAddCollectionItemsToDeck`. The frontend always sends a filter object
   and a zone, so users never hit it; Rust treats `null` as absent.
7. **Missing printings in writes raise** `Ecto.ConstraintError` (HTTP 500):
   `createCollectionItem` and `createLocation` (cover) with an unknown
   printing id. Rust: "scryfall_id does not exist" /
   "cover_scryfall_id does not exist" (Ecto's `foreign_key_constraint`
   message).

Seen again (already documented): `get_*!` raising 404 for missing records
(rust/notes/integration.md), `CloudSettings.validate_provider_config`
`CaseClauseError` for unknown providers (rust/notes/platform.md), CSV
conditions matched case-sensitively (rust/notes/collection.md), deck diff
comparing snow basics by oracle id (rust/notes/trade.md), `CollectionCheck`
date tie-breaks (rust/notes/trade.md).

## Intentional differences that are not bugs

- **Changeset error field order**: Elixir renders `traverse_errors` (a map)
  in map iteration order; with OTP 26+ atom keys follow the atom table, so
  e.g. `quantity …, for_trade_quantity …` and `theme_style …, palette …`.
  Rust sorts fields alphabetically. Same messages; only multi-field errors
  differ.
- **Validation of undefined required variables**: Absinthe reports `In
argument "id": Expected type "ID!", found null.` before execution;
  async-graphql reports `Variable id is not defined.` at the field. The
  frontend never omits required variables (seen only while the harness had
  capture bugs).

## Frontend observations

- `selectCandidate` sending a global id (Elixir bug 3 above) means choosing a
  printing for an ambiguous import row is broken against the Elixir backend.
- `AddCollectionItemToDeck` is in `gql.ts` but no component uses it (the
  dialog uses `BulkAddCollectionItemsToDeck`).
