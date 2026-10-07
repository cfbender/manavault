# Area: scryfall (catalog write pipeline, metrics, assets, vendor pricing)

## Ported modules

| Elixir | Rust |
| --- | --- |
| `Catalog.Scryfall.Import` | `catalog/scryfall/import.rs` (`import_cards`, `import_cards_with`, `import` (with state, invalidates caches), `run` over a stream of batches) |
| `Catalog.Scryfall.ImportRows` | `catalog/scryfall/rows.rs` |
| `Catalog.Scryfall.ImportDiff` | `catalog/scryfall/diff.rs` |
| `Catalog.Scryfall.ReconcilePrintings` | `catalog/scryfall/reconcile.rs` |
| `Catalog.ScryfallOracleTags` | `catalog/oracle_tags.rs` |
| `Catalog.Scryfall.BulkData`, `Fetch` | `catalog/scryfall/bulk.rs` (lotus `JsonLines` over the downloaded file), `sync::client`/`format_fetch_error` (lotus `ScryfallClient` on `state.http`) |
| `Catalog.Scryfall.Sync`, `Catalog.Sync` (`scryfall_syncs`), `Catalog.Scryfall` | `catalog/scryfall/sync.rs` (`run`, `latest`, `SyncOptions`, `BULK_TYPE`) |
| `Catalog.ScryfallCatalogWorker` | `catalog/scryfall/worker.rs` (also `enqueue_forced`, `forced`, `stale`) |
| `Catalog.EDHRec.CommanderRanks` | `catalog/metrics/commander_ranks.rs` |
| `Catalog.Mtgjson.Saltiness` | `catalog/metrics/saltiness.rs` (streaming serde visitor) |
| `ScryfallAssets`, `Catalog.ScryfallAssetsWorker`, `ScryfallAssetController` | `scryfall_assets/{mod,worker,web}.rs` |
| `Pricing`, `Pricing.Settings` | `pricing/mod.rs` (`source`, `set_source`, `vendor_statuses`, `last_synced_at`, `PriceSource`) |
| `Pricing.Money` | `pricing/money.rs` |
| `Pricing.Sync`, `Pricing.VendorPrice` | `pricing/sync.rs` |
| `Pricing.Vendors.{TcgCsv,CardKingdom,ManaPool}` | `pricing/vendors/{tcg_csv,card_kingdom,mana_pool}.rs` (`VendorFeed` trait, `FeedUrls`) |
| `Pricing.VendorSyncWorker` | `pricing/worker.rs` |
| `Pricing.Store` | `pricing/store.rs` (unchanged API; refreshed after syncs and source changes) |
| `PricingTypes`, `PricingResolvers`, `PricingOperations` | `pricing/graphql.rs` |
| `CardOperations` reload mutations, `QueryResolvers.reload_scryfall_*` | `catalog/scryfall/graphql.rs` |

Every external base URL is a parameter (`SyncOptions`, `AssetUrls`,
`FeedUrls`, `commander_ranks_pages_base_url`); tests use wiremock.

## GraphQL / routes / jobs

- Query `pricingSettings`; mutations `updatePricingSettings(source)`,
  `syncVendorPrices`, `reloadScryfallCatalog`, `reloadScryfallAssets` with
  `PricingSettings`, `PricingVendorStatus`, `UpdatePricingSettingsPayload`,
  `SyncVendorPricesPayload`, `ScryfallReloadResult`,
  `ReloadScryfall{Catalog,Assets}Payload`. `sdl_diff.py` reports no
  differences for these types.
- Route `GET /scryfall-assets/{*path}` (no auth; svg content type,
  `cache-control: public, max-age=86400`, `404 Not found`).
- Workers (names, queues, `max_attempts: 3`, unique by worker, timeouts as in
  Elixir): `Manavault.Catalog.ScryfallCatalogWorker` (catalog, 30 min),
  `Manavault.Catalog.ScryfallAssetsWorker` (catalog, 10 min),
  `Manavault.Pricing.VendorSyncWorker` (pricing, 30 min). Crontab:
  `@reboot`+`@daily` for both Scryfall workers, `@reboot`+`*/30 * * * *` for
  vendor sync. Manual reloads use `worker::enqueue_forced`, which mirrors
  Oban's `replace: [available/scheduled/retryable: [:args]]` by updating the
  queued unique job's args to `{"force":true}`.

## Deliberate differences

- Multi-faced cards whose faces carry no Oracle text, flavor text, or flavor
  name store `NULL` (lotus `full_*` returns `None`) where Elixir stored `""`
  (also `normalized_flavor_name`). Documented on `rows::rows`.
- Undecodable bulk records. Elixir fails the whole sync on invalid JSON or a
  non-object line (kept: the file is validated before any batch is written)
  and silently skips records it cannot build rows for (no `id`/`oracle_id`).
  It stored unknown vocabulary (a new legality, rarity, finish, color) raw.
  lotus's `Legality`/`Rarity`/`Finish`/`Color` have no catch-all and
  `RelatedCard.id` is required, so one new word would lose the whole card:
  `bulk::decode_card` retries a rejected record once with unrepresentable
  values dropped (legality entry removed, rarity → NULL, unknown finishes and
  colors filtered, id-less `all_parts` removed). A record that still fails
  (no `id`/`name`) is skipped, logged, and counted. `Catalog.import_cards`
  callers pass typed `ScryfallCard`s, so this only applies to the sync.
- Bulk files (default cards, oracle tags, MTGJSON AtomicCards) are streamed
  to `scryfall_cache_dir` with `download_to_file` and decoded from disk on a
  blocking thread, then deleted; Elixir held them in memory.
- `ImportSummary` adds `committed_batches` and `relinked_count`; the tests use
  them where the Elixir tests attached telemetry handlers to count writes.
- Vendor sync isolates a panicking feed (`tokio::spawn` + `JoinError`) the way
  Elixir rescued exceptions. Cached reads are invalidated once at the end of a
  run (after the price store refresh) instead of after every vendor; there is
  no collection-only invalidation hook yet, so pricing changes call
  `catalog::invalidate_after_import` (a superset of
  `Cache.invalidate_collection`). The read-side owner may want to add a
  narrower hook.
- Scryfall asset manifests are cached per asset root in a process-global map
  (`:persistent_term` in Elixir).
- `SyncRecord` errors: lotus formats HTTP failures as
  `"Scryfall request failed with HTTP 500 Internal Server Error"`;
  `sync::format_fetch_error` restores the Elixir wording
  (`"... with HTTP 500"`, and 404 as an HTTP error rather than "no such
  resource").

## Note for other areas

`scryfall_cards.cmc` and `edhrec_saltiness` are `NUMERIC` columns: SQLite
stores integral values (`0.0`, `999.0`) as INTEGER, and sqlx refuses to decode
INTEGER as `f64`. Select them as `CAST(col AS REAL)` (the diff does this).

## Elixir bugs found

- A database error raised inside `Import.run` crashed the sync and left the
  `scryfall_syncs` row `running` forever. The port records it as `failed`
  with the error text (documented on `sync::sync`).
- `ScryfallAssets.download_svg` used `Path.basename` of the SVG URL path, so a
  URL ending in `/..` would write to the asset root's parent. The port rejects
  `.`/`..` file names (`safe_filename`), also for `local_path`.

## lotus gaps

- `Legality`, `Rarity`, `Finish`, and `Color` have no catch-all variant, and
  `RelatedCard.id` is required: an unknown value fails decoding the whole
  card. Worked around with `bulk::decode_card`'s sanitize-and-retry. A
  catch-all (`Other(String)`) or lenient map decoding in lotus would remove
  that code.
- `BulkData` requires `type`; ManaVault reads only `jsonl_download_uri` from
  the per-type metadata endpoint, so `bulk::BulkMetadata` is a local struct.
- `ScryfallError::Status`'s `Display` includes the reason phrase and
  `NotFound` reads "Scryfall has no such resource"; both apps' Elixir code
  used `"Scryfall request failed with HTTP <code>"`.
- `is_gzip` is not re-exported from `lotus::scryfall` (only
  `lotus::scryfall::bulk::is_gzip`).
- `ScryfallCard.card_faces` cannot distinguish an absent list from an empty
  one (Elixir stored `"[]"` vs `"{}"` image URIs for those); Scryfall never
  sends an empty list, so the port uses `"{}"`.

## Tests

Ported (as Rust tests in `#[cfg(test)]` modules): `import_test.exs` (all
cases; write-lock/telemetry assertions via `ImportSummary` counters and
elapsed time), `sync_test.exs` (all cases, wiremock for every URL, including
commander-rank pagination, saltiness, oracle-tag fallback, malformed JSON
Lines, failure recording, progress logs via `LogHub`), `metric_refresh_test.exs`
(refresh + clear, failure keeps committed batches and converges, interrupted
cleanup retries; the probe that another raw connection writes between
batches relied on Ecto telemetry and is covered only indirectly by the
per-statement failure tests), oracle tag unit tests, `bulk_data_test.exs`,
`scryfall_assets_test.exs` plus the controller route, `scryfall_workers_test.exs`
(forced unique jobs, staleness, periodic skips; the Oban Lifeline test belongs
to the jobs foundation), `pricing_test.exs` (Money, Card Kingdom, ManaPool,
TcgCsv rows and fetch, replace semantics, settings, price store resolution),
`pricing/sync_test.exs` (crashing vendor), `pricing/vendor_sync_worker_test.exs`,
and the GraphQL tests `schema/pricing_test.exs` and `schema/scryfall_test.exs`.
`fetch_test.exs` tested Req options and has no equivalent.

`Catalog.Price.price_cents_for_printing` (Scryfall fallback) belongs to the
read side; the pricing tests check `PriceStore` resolution directly.

## Not done

Nothing in scope is knowingly left out. `catalog::invalidate_after_import`
is still the foundation's no-op until the read side fills it in.
