# Share

The public share GraphQL API, the shared deck page with its SVG/PNG link
previews, and the personal `/api/v1/decks` endpoint.

## Ported (Elixir → Rust)

| Elixir                                                                                                                                                                                                                                                            | Rust                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ManavaultWeb.PublicShareSchema` (root fields, `public_shared_deck/1`, `public_buylist_opts/1`)                                                                                                                                                                   | `share::schema` (`PublicQuery`, `schema()`, `sdl()`)                                                                                                                                            |
| `ManavaultWeb.Schema.PublicShareTypes` (public `Card`, `PublicCardSummary`, `Printing`, `CollectionItem`, `Location`, `Deck`, `DeckCard`, shared `DeckCardAllocationStatus`, `DeckBuylistEntry`, `ProducedToken`, connections, `Node`, `clamp_connection_args/2`) | `share::types`                                                                                                                                                                                  |
| `Absinthe.Plug` options of the `/share/graphql` forward (`token_limit: 5_000`, `analyze_complexity`/`max_complexity: 100_000`, the field `complexity/2` callbacks), `FieldsOnCorrectType`'s "Operation \"mutation\" not supported"                                | `share::protection`, `share::http` (the router already wraps the route in `public_graphql::{admit, validate}`; `check_depth` runs in `share::http`)                                             |
| `AppController.share_deck`, `share_deck_preview_image`, `share_deck_preview_png`, `share_preview/2`                                                                                                                                                               | `share::pages` (wired through `web::share`)                                                                                                                                                     |
| `DeckSharePreview` (`from_deck/2`, `svg/2`, labels)                                                                                                                                                                                                               | `share::preview` (`DeckPage`, `DeckPreview`)                                                                                                                                                    |
| `DeckSharePreview.ArtifactCache`                                                                                                                                                                                                                                  | `share::preview::artifact_cache`                                                                                                                                                                |
| `DeckSharePreview.ArtifactStore`                                                                                                                                                                                                                                  | `share::preview::artifact_store`                                                                                                                                                                |
| `DeckSharePreview.CoverFetcher`                                                                                                                                                                                                                                   | `share::preview::cover_fetcher`                                                                                                                                                                 |
| `DeckSharePreview.RenderWorker`                                                                                                                                                                                                                                   | `share::preview::render_worker` (worker `ManavaultWeb.DeckSharePreview.RenderWorker`, queue `preview`, max 3 attempts, unique per args while incomplete, 2 min timeout; registered in `app.rs`) |
| `DeckSharePreview.Renderer` (`resvg` CLI)                                                                                                                                                                                                                         | `share::preview::renderer` (resvg 0.48 crate, in process)                                                                                                                                       |
| `Api.V1.DeckController` + JSON                                                                                                                                                                                                                                    | `web::api_v1` (`GET /api/v1/decks`, behind the existing API key middleware)                                                                                                                     |

## GraphQL (public schema)

Root (`Query`, queries only): `deck(id:)`, `card(id:)`,
`cardByName(name:)`, `deckBuylist(...)`, `deckBuylistExport(...)`,
`wantsList(id:)`, `binderList(id:)`, with Absinthe's costs (10 000 + children
for `deck`/`card`/`cardByName`, 20 000 + children for the buylist and list
fields, `500 ×` children for `Deck.deckCards`, `300 ×` children for
`Card.printings`, otherwise 1 + children).

`manavault sdl --public` prints the schema. `sdl_diff.py` against
`_build/public-share-schema.graphql`: **0 differences**.

`wantsList`/`binderList` call the same `trade::share::{wants_list,
binder_list}` as `trade::ShareListQueries` and return the trade
`WantsList`/`BinderList` types; they are separate fields only so they can
carry the public complexity.

lotus compatibility: every field lotus's `DECK_QUERY`, `WANTS_QUERY`, and
`BINDER_QUERY` request (`cardCount`, `commanderColorIdentity`, `finish`,
`preferredPrinting`/`fallbackPrinting { scryfallId }`, list `finish`) is in
the Elixir public SDL already; nothing was added. `share::tests::lotus_client`
serves the router on a random local port and fetches a 603-card deck (two
pages), a want list, and a binder through lotus `DecklistClient` with an
`Allowlist` of `127.0.0.0/8`.

## Routes

- `GET /share/decks/{token}` (`:browser` pipeline): the shell with the deck's
  title, description, and `preview.png` Open Graph image; empty 404 for
  malformed, unknown, or revoked tokens.
- `GET /share/decks/{token}/preview.svg` (`image/svg+xml; charset=utf-8`)
  and `preview.png` (`image/png`, 503 when rendering fails), both
  `cache-control: public, max-age=300`, empty 404 otherwise.
- `GET|POST /share/graphql`.
- `GET /api/v1/decks?page=&per_page=` (default 50, max 100).

## Deliberate differences

- **Fingerprints.** The PNG fingerprint is SHA-256 of canonical JSON of the
  same payload (preview fields, token, asset/assets/renderer/source
  versions), not of `:erlang.term_to_binary/2`. The backends never share
  artifacts; a cache directory used by both just holds both sets.
- **Renderer.** resvg 0.48.1 as a library (the version mise pinned for the
  CLI), system fonts with DejaVu Sans as `sans-serif`, rendering on a
  blocking thread. The renderer version string stays `resvg-0.48.1`.
- **Waiting for renders.** The `preview_rendered` notification is an
  in-process broadcast (single node); waiting requests also poll the store
  every 100 ms for up to 2 minutes, as before. With background jobs
  disabled (`MANAVAULT_JOBS_DISABLED`, tests) nothing would run the queue,
  so the request renders inline, like Oban's `:inline` testing mode.
- **Uniqueness.** Oban's `keys: [:fingerprint]` is `Unique::WorkerArgs`: the
  fingerprint covers every preview field in the args, so the rules agree.
- **Error shape.** Requests refused before execution (token, depth,
  complexity, mutation) answer `{"errors": [...]}` without `data`, like
  Absinthe. Complexity errors list every over-limit node, deepest first,
  with Absinthe's messages ("Field deck is too complex: complexity is
  115000 and maximum is 100000", "Operation is too complex: ..."). Syntax
  and validation errors keep async-graphql's wording (also without `data`).
  The schema also sets async-graphql's `limit_complexity`/`limit_depth`
  with the same costs as a backstop.
- **Text measuring.** The SVG layout counts Unicode scalar values where
  Elixir counted graphemes (only differs for combining sequences), and
  `compact_number/1` rounds tenths half up in integers (`1.25k` → `1.3k`;
  Elixir's float rounding could differ for values like 1 150).
- **Prices.** `DeckCard.priceCents` uses the preferred printing only (the
  Dataloader path Absinthe took); the preview's total uses the preferred
  printing, else the newest printing, as `from_deck/2` saw it with the full
  preload.
- **Connections.** Like Elixir, `clamp_connection_args` only clamps given
  `first`/`last`; a `deckCards`/`printings` selection without either returns
  every item (the complexity still charges 500×/300×).
- `assumeNoOwned` is accepted and ignored: public buylists always assume
  nothing is owned (as Elixir).
- `/api/v1/decks` answers a JSON 500 on database errors (Elixir crashed).

## Elixir bugs found

None that needed a behavior change.

## lotus gaps

None for this area.

## Foundation and shared-file changes

- `web/share.rs`: the hooks now add the share deck routes and return the
  `/share/graphql` handler.
- `web/api_v1.rs`: the 501 placeholder is replaced; `routes()` now returns
  `Router<WebState>`; the internal `error` helper is `error_response`.
- `main.rs`: `manavault sdl --public`; `lib.rs`: `pub mod share`; `app.rs`:
  the render worker; `Cargo.toml`: `resvg = "0.48"`; README.
- `scripts/sdl_diff.py`: scalars are parsed separately, so `scalar Json` no
  longer swallows the next type's body (it misreported `PageInfo`,
  `Location`, and `LinkDeckExternalSourcePayload`).
- No deck module changes: the share code reads decks through
  `records::get_by_share_token`, `records::{list_decks, count_decks}`,
  `contents::{load_deck_contents, load_contents, cover_image_url,
commander_color_identity}`, `tags::{list_deck_tags, tag_ids_by_deck_card}`,
  `decks::Deck::contents`, and the deck types `DeckLegality`/`DeckTag`.

## Tests

51 tests under `share::**` (733 server tests in all), ported from
`public_graphql_protection_test.exs`, `public_share_cache_test.exs`,
`public_wants_share_test.exs`, `public_binder_share_test.exs`,
`public_access_mutation_guard_test.exs` (public parts), the public parts of
`deck_detail_and_share_test.exs`, the share-deck parts of
`app_controller_test.exs`, `deck_share_preview_artifact_cache_test.exs`, and
`api/v1/deck_controller_test.exs`; plus the lotus round trip, the frontend
`DeckDocument` (read from `assets/react`) against the public schema, SVG
layout, token counting, complexity, and resvg rendering.

Not ported: the deck query counts of the Elixir tests (no query telemetry;
the behaviors they guard — malformed tokens never query — are covered by
`records::get_by_share_token`), `Manavault.Cache` assertions (no share cache
here), and the "renderer command runner is injectable" test (no command).
