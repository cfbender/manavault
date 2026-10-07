# AI deck analysis and deck questions

## Ported

| Elixir                                                                                                                                                           | Rust                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Manavault.AI` (delegates)                                                                                                                                       | `ai` (`mod.rs`: `AiError`, `Configured` = `UpdateSettings.configured/1`, `Provider` = `Provider.module/1`)                                                                                              |
| `AI.Provider`, `AI.Providers.OpenRouter` (completions, tool loop, tool-less retry, diagnostics log line)                                                         | `ai::openrouter` (settings validation stays in `settings::ai::openrouter`; `response_error` is reused from there)                                                                                       |
| `AI.AnalyzeDeck` (`enqueue`, `latest_job`, `run`, `refresh_all`, `analyze_payload`)                                                                              | `ai::analyze_deck`                                                                                                                                                                                      |
| `AI.DeckAnalysis`, `DeckAnalysis.Payload`, `.Prompt`, `.Result` (bracket rating)                                                                                 | `ai::deck_analysis::{payload, prompt, result}`; prompt texts in `ai::prompt_text` (copied verbatim from the heredocs)                                                                                   |
| `AI.AnalyzeDeckList`                                                                                                                                             | `ai::analyze_deck_list`                                                                                                                                                                                 |
| `Trade.Lists.resolve/1` / `ListSource` + `Catalog.Decklists.parse/2` (the parts list analysis needs)                                                             | `trade::list_source::resolve` since integration (`ai::deck_source` was removed; see `integration.md`)                                                                                                   |
| `AI.DeckAnalysisRequest`, `AI.ListDeckAnalysisRequests`                                                                                                          | `ai::requests`                                                                                                                                                                                          |
| `AI.DeckQuestion`                                                                                                                                                | `ai::deck_question`                                                                                                                                                                                     |
| `AI.AnswerDeckQuestion`                                                                                                                                          | `ai::answer_deck_question`                                                                                                                                                                              |
| `AI.DeckAnalysisWorker`, `AI.DeckQuestionWorker`                                                                                                                 | `ai::workers` (`deck_analysis`, `deck_question`; queue `ai`, `max_attempts: 3`, analysis unique on worker+args while pending, backoff `attempt * 15` s, 10 min timeout); registered in `app::workers()` |
| `AI.Tools`, `AI.CardLookupTool`, `AI.CollectionStatusTool` (+ the non-deck-card parts of `EDHRec.Response.CollectionStatus`)                                     | `ai::tools::{mod, card_lookup, collection_status}`                                                                                                                                                      |
| `Catalog.DeckQuestionAnswer`, `Catalog.Decks.QuestionAnswers`                                                                                                    | `ai::question_answers`                                                                                                                                                                                  |
| Deck reads/writes AI needs (`get_deck`, `deck_cards`, `save_deck_analysis`, `get_deck_by_share_token`) and `DeckSummaries.commander_color_identity_from_cards/1` | `ai::decks` (SQL) and `deck_analysis::payload::commander_color_identity`                                                                                                                                |
| AI parts of `DeckTypes`, `DeckOperations`, `DeckMutations`, `QueryResolvers`, `DeckFields`, `AIOperations`, `AIResolvers`                                        | `ai::schema` (`AiQueries`, `AiMutations`)                                                                                                                                                               |

Tests ported: `test/manavault/ai_test.exs` (all but the two settings tests,
already in `settings::ai`), `test/manavault/ai/*` (`deck_analysis_test`,
`analyze_deck_test`, `deck_question_test`, `card_lookup_tool_test`,
`collection_status_tool_test`, `tools_test`), and
`test/manavault_web/schema/ai_test.exs` (the `deck { ... }` selections are
replaced by SQL checks until `Deck` exists), plus extra coverage for error
messages, validation, decklist parsing, link resolution, and backoff. 66 tests
in `ai::`.

## GraphQL

Types: `DeckAnalysisJob` (`id`, `status`), `DeckQuestionAnswer`,
`DeckAnalysisRequest`, `DeckSwapContextInput`, `AnalyzeDeckPayload` (`job`),
`AnalyzeDeckListPayload`, `AskDeckQuestionPayload`,
`DeleteDeckQuestionAnswerPayload`, `RefreshAllDeckAnalysesPayload`.

Queries: `deckAnalysisRequests(limit)`, `deckAnalysisJob(deckId)`,
`deckQuestionAnswers(deckId, threadId)`.

Mutations: `refreshAllDeckAnalyses`, `analyzeDeck`, `analyzeDeckList`,
`askDeckQuestion`, `deleteDeckQuestionAnswer`.

`sdl_diff.py` reports only the two deferred fields below.

## Left for integration (`TODO(integration)` in the code)

- `DeckAnalysisJob.deck: Deck!` — `ai::schema::DeckAnalysisJob` keeps
  `JobProgress::deck_id`; resolve the `Deck` after the status (as Elixir does,
  so a completed job includes its saved analysis).
- `AnalyzeDeckPayload.deck: Deck` — the payload keeps `deck_id` (skipped
  field).
- `ai::decks` reads/writes decks with its own SQL; switch to the decks port's
  functions (and its deck cache invalidation, if it has one —
  `Catalog.save_deck_analysis` invalidated the decks cache) once merged.
- `ai::tools::collection_status` computes `CollectionStatus` for cards not in
  the deck itself; share the decks/EDHREC port's version if one exists.
- `ai::deck_source` (see Overlap).
- `Deck.ai_analysis`, `aiAnalysisModel`, `aiAnalyzedAt`, the bracket fields,
  and the share preview's bracket label belong to the `Deck` type; the label
  helper is `ai::bracket_label` (`DeckAnalysis.bracket_label/3`).

## Overlap with other areas

- **Trade (`Trade.ListSource`)**: `analyzeDeckList(url:)` needs list
  resolution. `ai::deck_source` implements the subset AI uses on top of lotus
  `DeckLink`/`DecklistClient`: a host-less `/share/decks/<token>` link
  resolves locally; Moxfield, Archidekt, and absolute ManaVault share links
  are fetched with the lotus client (allowlist from
  `config.remote_share_allowlist`, default API bases, Elixir's error
  messages). Host-less `/share/wants/…` and `/share/binder/…` links (local
  trade lists) return "Unsupported link…" until it can call the trade port's
  resolver. The trade port presumably adds Moxfield/Archidekt base-URL config;
  at integration, build the client from that config and replace this module
  with the trade resolver.
- **Decks (`Catalog.Decklists.parse/2`)**: `deck_source::parse_text` ports the
  parser (zones, `SB:`, `2x`, comments, `(SET) 123` printing lookup, finish,
  duplicate merging) but only returns name/quantity/zone. Replace with the
  decks port's parser at integration.

## Deliberate differences

- A missing deck in `analyzeDeck`, `askDeckQuestion`, and
  `deckQuestionAnswers` is the GraphQL error "Deck was not found." (Elixir's
  `get_deck!` raised and the request failed with HTTP 404). Database failures
  are "Something went wrong.".
- Worker jobs whose args lack `deck_id` / `question_answer_id` are cancelled
  (Elixir raised `FunctionClauseError` and retried).
- `DeckQuestionWorker` accepts the id as a number or a numeric string, as
  `Repo.get` did.
- A database error inside a tool call fails the completion with "Something
  went wrong." (Elixir raised inside the worker).
- The request-error log line's `reason=` is `:timeout`, `:econnrefused`, or
  `unknown` (reqwest has no Mint reason atoms).
- `refreshAllDeckAnalyses` inserts all jobs in one `BEGIN IMMEDIATE`
  transaction like `Repo.transaction`, with the same per-deck uniqueness as
  `analyzeDeck`.

## Elixir bugs found

None that change behavior. (`Result.bracket_label/3` with a `nil` official
bracket would render `"Bracket "`/`"Bracket -"`; the Rust signature takes an
integer, and Markdown rendering never calls it without one.)

## lotus

No bugs hit. Gap: lotus has no pasted-decklist _text_ parser
(`Catalog.Decklists.parse/2`), which ManaVault (deck import, trade lists,
list analysis) and plausibly the-gathering both need; ported locally in
`ai::deck_source` for now.

## Foundation changes

- `jobs/mod.rs`: `Worker::backoff(attempt)` (default `2^attempt + 15` seconds,
  used by `record`); `Jobs::enqueue_in(conn, …)` + `Jobs::wake()` to insert a
  job inside the caller's write transaction (`Oban.insert` in an
  `Ecto.Multi`) — `enqueue_at` now delegates to the same insert; `execute`
  returns the outcome; test-only `Jobs::drain_queue(state, queue,
with_scheduled)` (`Oban.drain_queue`) returning `Drained` counts.
- `test_support.rs`: `log_hub()`, the single process-wide test log
  subscriber (only one global subscriber can exist per test binary);
  `catalog/scryfall/tests.rs`'s `test_log_hub` now delegates to it.
- `lib.rs`, `graphql/mod.rs`, `app.rs`: module, merged roots, workers.
- Note: `cargo fmt --check` already fails on `rust-backend` for module order in
  `catalog/mod.rs`, `catalog/scryfall/mod.rs`, and `lib.rs`; I left those
  files as they were.
- Pre-existing flake (not from this port, reproduced on `rust-backend` at
  8f38e2d): `web::tests::graphql_csrf::transport_batches_run_each_query`
  fails about one run in five to ten — the non-batched response sometimes
  serializes `appearanceSettings` before `backupSettings` instead of in query
  order.
