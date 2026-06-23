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

Start Phoenix:

```sh
mise run dev
```

Visit <http://localhost:4000>.

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
aube run typecheck
aube run test:react
aube run build
```

GraphQL TypeScript artifacts are generated from `codegen.ts`:

```sh
aube run codegen
```

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

## Release Helper

Release commands are documented in [releasing.md](releasing.md). The short form
is:

```sh
mise run changelog -- patch
mise run release -- patch
```

Use `minor` or `major` instead of `patch` when the version bump requires it.
