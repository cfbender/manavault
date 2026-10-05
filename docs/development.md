# Development

ManaVault is a Phoenix application with a Vite/React frontend and optional
Capacitor native shells. Tool versions are pinned in `mise.toml`.

## Requirements

- `mise`
- a platform that can run Elixir, Node, and SQLite
- macOS with Xcode only when building/running the iOS shell

## Setup

Install the pinned toolchain, JavaScript dependencies, Elixir dependencies,
database, and assets:

```sh
mise run setup
```

Start Phoenix (the Vite dev server runs as a Phoenix watcher):

```sh
mise run dev
```

Visit <http://localhost:4000>. If something is already listening on port 4000
(`ss -ltnp 'sport = :4000'`), reuse that server instead of starting another.

The development database is `manavault_dev.db` in the repository root. The
Scryfall catalog sync starts on boot; until it finishes, card search returns
few or no results. Force a reload from **Settings -> Scryfall data** or run
`mise exec -- mix manavault.scryfall.sync`.

Health check:

```sh
curl http://localhost:4000/health
# {"status":"ok"}
```

## Tests and Checks

Run the Elixir test suite:

```sh
mise run test
```

Run the fuller local precommit suite:

```sh
mise run precommit
```

Useful frontend commands:

```sh
mise exec -- aube run typecheck
mise exec -- aube run test:react
mise exec -- aube run build
```

Audit dependencies for known advisories:

```sh
mise exec -- mix hex.audit
mise exec -- aube audit
```

`mix hex.audit` also runs as part of `precommit`. Transitive JavaScript
packages that upstream has not bumped yet are pinned through the `overrides`
block in `package.json`; drop an override once `aube why <package>` shows every
dependant already requires a fixed version. `aube audit` reports vite
advisories against `vite@0.3.x`: that entry is `vite-plus` aliasing
`@voidzero-dev/vite-plus-core` as `vite`, not the real Vite package, so those
findings are false positives (the real `vite` stays on the version declared in
`package.json`).

GraphQL TypeScript artifacts are generated from `codegen.ts`:

```sh
mise exec -- aube run codegen
```

`aube run codegen` first dumps the Absinthe schema to
`_build/graphql-schema.graphql` with `mix absinthe.schema.sdl`, then runs
`graphql-codegen` against that file, so it does not need a running server.
Introspecting a live server does not work: every `/api/graphql` POST requires a
CSRF token, including in `MANAVAULT_AUTH_DISABLED=true` mode. Set
`GRAPHQL_SCHEMA_URL` to another SDL or JSON schema file to override the source.
Commit the regenerated files under `assets/react/src/gql/`.

## Native Shell Development

Install JavaScript dependencies and sync Capacitor native projects:

```sh
mise run setup:native
```

Android uses the project-local Java and Android SDK toolchains declared in
`mise.toml`. Accept licenses and install SDK packages needed by Capacitor and
native-run:

```sh
mise run setup:android-sdk
```

Build, run, or open Android:

```sh
mise run android:build
mise run android:run
mise run android:open
```

The Android tasks sync the web/native metadata before building or running.

Sync or open iOS from macOS:

```sh
mise run ios:sync
mise run ios:open
```

The iOS project is checked into the repo and syncs from the same web assets, but
building or running requires Xcode.

Like Android, the iOS shell loads the saved server URL as the app origin on
launch and keeps navigation to that origin inside the web view; other hosts open
in Safari. iOS App Transport Security blocks plain `http://` servers, so point
the iOS shell at an `https://` URL.

## Token Back Pairings

`priv/data/token_backs.json` lists which single-faced tokens Wizards prints
back to back (for example M3C Dragon #12 with MH3 Copy #1 and Treasure #34).
The scanner's **What is on the back?** prompt and the Tokens tab's **Add token**
dialog show these under **Known backs** before the rest of the set. The file is
checked in and loaded at compile time by `Manavault.Catalog.Tokens.KnownBacks`,
so updating it means regenerating it and shipping a new build.

The pairings come from the card image galleries on magic.wizards.com, which
carry a front and back image for every double-sided token from Modern
Horizons 3 onward (older galleries have no back images, and neither Scryfall
nor MTGJSON records pairings). The galleries read from a public Contentful
space, so the script needs that space's read-only bearer token:

1. Open any card image gallery, for example
   <https://magic.wizards.com/en/products/modern-horizons-3/card-image-gallery>,
   with the browser's network panel open.
2. Find a request to `cdn.contentful.com` and copy the value after `Bearer ` in
   its `Authorization` header. The token is public but rotates occasionally;
   do not commit it.
3. Make sure the local Scryfall catalog is current (run
   `mise exec -- mix manavault.scryfall.sync`, or let the running server's
   sync finish), since every gallery face is resolved to a catalog printing by
   token set code (`t` + set) and collector number, and faces that fail to
   resolve are dropped.
4. Regenerate the file:

   ```sh
   WOTC_CONTENTFUL_TOKEN=... mise exec -- mix run scripts/token_backs.exs
   ```

   The script prints each dropped face and finishes with
   `wrote N pairs (M unresolved faces dropped)`. Dropped faces are normally
   helper cards and emblems (The Monarch, Poison and Energy counters, City's
   Blessing) that the catalog does not import as tokens, plus
   `Incubator // Phyrexian`, which Scryfall already stores as one double-faced
   printing. A dropped creature or artifact token means the catalog sync is
   stale or the set's gallery filed it under a different collector number.

5. Review the diff of `priv/data/token_backs.json` (the file is sorted so
   additions show up as new lines), run
   `mise exec -- mix test test/manavault/catalog/tokens`, and commit the
   data file together with any script change.

The galleries list one product's pairing per face, so the file is a hint, not
the full set of combinations; bundles and decks pair the same face differently.
That is why the UI always keeps the rest of the set visible under **Other
tokens**.

## Release Helper

Release commands are documented in [releasing.md](releasing.md). The short form
is:

```sh
mise run changelog -- patch
mise run release -- patch
```

Use `minor` or `major` instead of `patch` when the version bump requires it.
