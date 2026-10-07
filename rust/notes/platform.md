# Platform port notes

Web platform, authentication, settings, API keys, backups, and the scanner.

## Ported (Elixir → Rust)

| Elixir                                                                                                                                                                                     | Rust                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `ManavaultWeb.Endpoint` (Plug.Static ×3, session, `PublicGraphQLProtection :admit`)                                                                                                        | `web/mod.rs`, `web/static_files.rs`, `web/public_graphql.rs`                                    |
| `ManavaultWeb.Router` (all scopes/pipelines)                                                                                                                                               | `web/mod.rs`                                                                                    |
| `put_secure_browser_headers`, `protect_from_forgery`, `Plugs.ContentSecurityPolicy`, `Plugs.CrossOriginIsolation`                                                                          | `web/browser.rs`                                                                                |
| `Plug.Parsers` (urlencoded, multipart, JSON, `application/graphql`)                                                                                                                        | `web/params.rs`                                                                                 |
| `Plugs.GraphQLCSRFProtection` + `Absinthe.Plug` transport (batches, form bodies)                                                                                                           | `web/graphql_http.rs`                                                                           |
| `AppController.index`/`render_app`, `app_html/app.html.eex`, `DeckSharePreview.default/1`                                                                                                  | `web/app_shell.rs`                                                                              |
| share pages hook (`share_deck`, `share_wants`, `share_binder`, previews, `/share/graphql`)                                                                                                 | `web/share.rs` (empty hooks, documented)                                                        |
| `AuthController`, `auth_html/login.html.eex`, `AuthReturnPath`                                                                                                                             | `web/auth_controller.rs`, `web/return_path.rs`                                                  |
| `ClientIP`, `AllowedOrigins`, `AssetVersion`, `SessionOptions`                                                                                                                             | `web/client_ip.rs`, `web/allowed_origins.rs`, `web/asset_version.rs`, existing `web/session.rs` |
| `UserSocket` + `Absinthe.Phoenix` channel (Phoenix Channels v2/v1 JSON)                                                                                                                    | `web/socket.rs`                                                                                 |
| `PwaController`, `VendorController` + `Vendors.StarCityGames`                                                                                                                              | `web/pwa.rs`, `web/vendor.rs`                                                                   |
| `Plugs.ApiKeyAuthentication`, `/api/v1` scope                                                                                                                                              | `web/api_v1.rs` (placeholder `GET /api/v1/decks` → 501 until the deck module adds it)           |
| `PublicShareRequestLimiter`                                                                                                                                                                | `web/rate_limit.rs` (in `AppState.public_requests`)                                             |
| `Manavault.Auth`, `Auth.AttemptLimiter`, `Auth.ClientFailure`                                                                                                                              | `auth/mod.rs`, `auth/attempt_limiter.rs` (in `AppState.login_attempts`)                         |
| `Auth.ApiKeys`, `ApiKey`, `ApiKeyOperations`/`ApiKeyTypes`                                                                                                                                 | `api_keys/mod.rs`                                                                               |
| `Manavault.Appearance(.Settings)`, appearance resolvers/types                                                                                                                              | `settings/appearance.rs`                                                                        |
| `AI.Settings`, `AI.UpdateSettings`, `OpenRouter.validate_settings` (settings only)                                                                                                         | `settings/ai.rs`                                                                                |
| Ecto changeset error rendering (`Errors.changeset_error_message`)                                                                                                                          | `settings/changeset.rs`                                                                         |
| `Manavault.Backup.*` (Settings/CloudSettings, Cron, Archive, Snapshot, Create, Restore, S3Client, GoogleDriveClient, Retention, Cloud, CloudBackupWorker, PendingRestore, MigrationBackup) | `backup/*.rs`                                                                                   |
| `BackupTypes`, `BackupResolvers`, `Catalog.BackupOperations`                                                                                                                               | `backup/graphql.rs`                                                                             |
| `Scanner.Bundle`, `Scanner.BundleUpdateWorker`, `Scanner.Corrections`                                                                                                                      | `scanner/bundle.rs`, `scanner/update_worker.rs`, `scanner/corrections.rs`                       |
| `ScannerBundleController`(+JSON), `ScannerCorrectionController`, `Plugs.ScannerExportAuth`                                                                                                 | `scanner/http.rs`                                                                               |
| `ObanLogger`                                                                                                                                                                               | `jobs::failure_message` (logged on every failed attempt)                                        |
| `mix manavault.auth.hash` / `.auth.unban` / `.backup` / `.restore`                                                                                                                         | `manavault hash-password` (existing) / `unban` / `backup` / `restore` (`cli.rs`)                |

Workers: `Manavault.Scanner.BundleUpdateWorker` (queue `catalog`, `@reboot` and
`0 */6 * * *`), `Manavault.Backup.CloudBackupWorker` (queue `backup`,
`* * * * *`, checks the owner's cron against the job's `scheduled_at`).

## GraphQL fields

Queries: `appearanceSettings`, `aiSettings`, `apiKeys`, `backupSettings`,
`cloudBackups`. Mutations: `updateAppearanceSettings`, `updateAiSettings`,
`createApiKey`, `revokeApiKey`, `updateBackupSettings`, `runCloudBackup`,
`stageCloudRestore`. The `serverLog` subscription is served over the socket.
`sdl_diff.py` shows no differences for these types.

## Routes

`/health`, static files, `/site.webmanifest`, `/sw.js`,
`/.well-known/assetlinks.json`, `/socket/websocket`, `GET/POST /login`,
`POST /logout`, `POST /vendors/star-city-games/deck-builder`, all shell routes
(`/`, `/settings`, `/cards[/:id]`, `/decks[/:id[/playtest]]`, `/collection`,
`/collection/new`, `/collection/locations/:id`, `/collection/:id/edit`,
`/trade`, `/scan` with COOP/COEP), `POST /api/graphql`, `/api/scanner/*`,
`/api/v1/*` (API key middleware). Unknown routes answer Phoenix's 404.

## Deliberate differences

- The shell loads `/assets/react/app.js` directly, exactly as the template
  does; there is no Vite manifest lookup in the Elixir app either.
- `require_browser` in `web/session.rs` now redirects with 302 (Phoenix) instead
  of axum's 303 (foundation fix).
- `logs.rs`: server log messages no longer carry a `[level] ` prefix and ANSI
  codes are stripped, like `Logger.Formatter.format_event/2` output (foundation
  fix; the level is its own field).
- `jobs/mod.rs`: failed attempts log the `ObanLogger` line at error level
  (foundation change, replaces the old warn line).
- GraphQL over HTTP keeps field order; socket frames are built as
  `serde_json::Value`, so their object keys are sorted (clients do not care).
- Socket subscription ids are random (`__absinthe__:doc:<n>`), not Absinthe's
  document hashes; identical subscriptions get distinct ids.
- `revokeApiKey` with a non-numeric id answers "API key not found" (Ecto
  raises a cast error).
- `updateBackupSettings` with `enabled: null` keeps the saved value (Ecto
  fails the NOT NULL write).
- Static files: ETags are derived from size+mtime with SHA-256, not
  `:erlang.phash2`; behavior (304 on match) is the same.
- Transport errors in backup/AI clients read as reqwest messages instead of
  Elixir `inspect` of `Req.TransportError`. Google Drive HTTP errors keep the
  Elixir `inspect(body)` format.
- Config gained `asset_version`, `android_cert_fingerprints`, and
  `platform_urls` (OpenRouter, Google OAuth/Drive, GitHub releases, SCG); test
  config points them at a closed local port. `MANAVAULT_ALLOWED_ORIGINS` is
  validated at startup like `AllowedOrigins.parse/1`.
- `AppState` gained `login_attempts` and `public_requests` (the two GenServers).
- MigrationBackup: this backend never migrates, so the pre-migration backup
  only runs when a production database lacks known migrations, right before
  `db::prepare` refuses it.
- Restore also removes the old database's `-wal`/`-shm` files (copied into the
  pre-restore directory first); see bugs below.

## Elixir bugs found (fixed here)

- `ManavaultWeb.static_paths/0` omits `android-chrome-*-maskable.png`, which the
  PWA manifest references, so Phoenix 404s them. Served here.
- `Backup.Cron` requires day-of-month AND day-of-week when both are restricted;
  standard cron (and this port) matches either.
- `S3Client.build_presigned_url` re-encodes the already-encoded object path, so
  keys/prefixes with characters outside `A-Za-z0-9-_.~` get rejected
  signatures. The canonical URI is encoded once here.
- `Backup.Restore` copies the database over an existing file but leaves its
  `-wal`/`-shm`, which SQLite would replay onto the restored database.
- `CloudSettings.validate_provider_config` raises `CaseClauseError` for an
  unknown provider; here it only reports `provider is invalid`.
- `BundleUpdateWorker` writes every file name listed in a remote manifest under
  the incoming directory before verifying it, so `../` names escape it. Names
  outside the bundle file list are refused before downloading.

## lotus gaps

None needed for this area.

## Left undone / for other areas

- Share pages, preview SVG/PNG, and the public share schema: hooks in
  `web/share.rs`; `public_graphql::{admit, validate, check_depth}` are ready.
  Absinthe's token limit (5,000) and complexity limit (100,000) belong with the
  public schema (async-graphql `limit_complexity`, plus matching messages).
- `GET /api/v1/decks` (deck module): replace the placeholder in `web/api_v1.rs`.
- `/scryfall-assets/*path` (`ScryfallAssetController`) is not routed here; it
  belongs to the Scryfall assets port.
- Tests not ported because they need other areas: share-page parts of
  `app_controller_test.exs`, `public_graphql_protection_test.exs` parts that need
  the public schema/decks, `api/v1/deck_controller_test.exs`, and the AI analysis
  parts of `ai_test.exs`/`schema/ai_test.exs`. GraphQL CSRF tests use API-key and
  appearance fields instead of `createDeck`/`homeSummary`.
- `Plug.MethodOverride` is not ported (no route uses PUT/DELETE).
