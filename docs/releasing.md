# Releasing ManaVault

This document describes the release helper copied from Hygge and adapted for
ManaVault.

## Prerequisites

Release tooling is managed by `mise.toml`:

```sh
mise install
```

The release helper uses `git-cliff` to generate `CHANGELOG.md` from commits.

## Generate Or Update The Changelog

Preview or regenerate the changelog for the next version:

```sh
mise run changelog -- patch
mise run changelog -- minor
mise run changelog -- major
```

The script reads the current version from `mix.exs`, calculates the next version,
and writes a section for the `vX.Y.Z` tag.

## Cut A Release

Run the release task from a clean `main` branch after the desired changes are
committed:

```sh
mise run release -- patch
```

The task:

- generates `CHANGELOG.md`
- bumps the `mix.exs` and `package.json` versions
- refreshes `native_www/version.json`
- updates README Docker tag examples
- commits `chore: release vX.Y.Z`
- creates an annotated `vX.Y.Z` tag
- pushes the current branch and the tag to `origin`

The tag push triggers `.github/workflows/container.yml`, which publishes the
container image to GitHub Container Registry, and `.github/workflows/capacitor.yml`,
which builds the Capacitor Android debug APK and attaches it to the GitHub
release.

Dry run:

```sh
MANAVAULT_RELEASE_DRY_RUN=1 mise run release -- patch
```
