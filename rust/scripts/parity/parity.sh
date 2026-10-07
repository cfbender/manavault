#!/usr/bin/env bash
# Runs the differential parity harness end to end:
#   1. copies the catalog snapshot twice (one database per backend),
#   2. starts the Elixir backend (MIX_ENV=prod, Oban queues/plugins off) and
#      the Rust backend (jobs disabled) on identical data,
#   3. replays the scenario against both and diffs the responses,
#   4. stops both servers.
#
# By default everything runs inside a fresh network namespace (`unshare -rn`)
# with only loopback, so operations that call external services (EDHREC,
# Commander Spellbook, Recommander, Moxfield/Archidekt, OpenRouter, cloud
# backups) fail the same way on both sides instead of hitting the internet.
# Pass --live to keep network access (and call the live external services).
#
# Usage (from the worktree root):
#   rust/scripts/parity/parity.sh [--live] [--report /tmp/parity-report.json]
#
# Environment:
#   PARITY_SNAPSHOT  catalog database to copy (default /home/user/workspace/parity/catalog-snapshot.db)
#   ELIXIR_REF       git commit or tag of the Elixir reference app (default b2b70d5, the
#                    last rust-backend commit that still contained it; an Elixir release tag
#                    such as v1.4.3 also works, minus the Elixir fixes made on this branch)
#   ELIXIR_DIR       git worktree of ELIXIR_REF, prepared on first use (default /tmp/elixir-ref)
#   PARITY_DIR       scratch directory for databases and logs (default /tmp/parity-run)
#   RUST_BIN         Rust server binary (default rust/target/debug/manavault; built if missing)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SNAPSHOT="${PARITY_SNAPSHOT:-/home/user/workspace/parity/catalog-snapshot.db}"
ELIXIR_REF="${ELIXIR_REF:-b2b70d5}"
ELIXIR_DIR="${ELIXIR_DIR:-/tmp/elixir-ref}"
PARITY_DIR="${PARITY_DIR:-/tmp/parity-run}"
RUST_BIN="${RUST_BIN:-$ROOT/rust/target/debug/manavault}"
LIVE=0
HARNESS_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--live" ]]; then LIVE=1; fi
  HARNESS_ARGS+=("$arg")
done

# Preparation needs the network (Hex packages, toolchains), so it runs before
# switching into the loopback-only namespace.
if [[ "${PARITY_IN_NETNS:-0}" != "1" ]]; then
  if [[ ! -x "$RUST_BIN" ]]; then
    (cd "$ROOT/rust" && CARGO_INCREMENTAL=0 mise exec -- cargo build --locked --bin manavault)
  fi

  if [[ ! -f "$ELIXIR_DIR/mix.exs" ]]; then
    # The Elixir app is no longer on this branch: check out the reference
    # commit as a detached worktree and build it with its own pinned toolchain.
    echo "preparing the Elixir reference app ($ELIXIR_REF) in $ELIXIR_DIR"
    rm -rf "$ELIXIR_DIR"
    git -C "$ROOT" worktree prune
    git -C "$ROOT" worktree add --detach "$ELIXIR_DIR" "$ELIXIR_REF"
    printf '%s\n' '' '# parity harness: never run jobs or cron (queued jobs are only inserted).' \
      'config :manavault, Oban, queues: false, plugins: false' >>"$ELIXIR_DIR/config/prod.exs"
    (
      cd "$ELIXIR_DIR"
      mise trust -q
      MISE_ENABLE_TOOLS=elixir,erlang mise install -y elixir erlang
      export MIX_ENV=prod MISE_ENABLE_TOOLS=elixir,erlang
      mise exec -- mix local.hex --force --if-missing
      mise exec -- mix local.rebar --force --if-missing
      mise exec -- mix deps.get --only prod
      mise exec -- mix compile
    )
  fi
  # The reference app renders the same built frontend the Rust server serves.
  if [[ -d "$ROOT/priv/static/assets" && ! -d "$ELIXIR_DIR/priv/static/assets" ]]; then
    cp -r "$ROOT/priv/static/assets" "$ELIXIR_DIR/priv/static/assets"
  fi
fi

if [[ "${PARITY_IN_NETNS:-0}" != "1" && "$LIVE" == "0" ]]; then
  # Re-exec inside a user + network namespace that only has loopback.
  exec unshare -rn env PARITY_IN_NETNS=1 bash -c 'ip link set lo up && exec "$0" "$@"' "$0" "$@"
fi

for port in 4100 4200; do
  if curl -s -m 2 -o /dev/null "http://localhost:$port/"; then
    echo "port $port is already in use; stop that server first" >&2
    exit 2
  fi
done

rm -rf "$PARITY_DIR"
mkdir -p "$PARITY_DIR/ex-data" "$PARITY_DIR/rs-data"
cp "$SNAPSHOT" "$PARITY_DIR/ex.db"
cp "$SNAPSHOT" "$PARITY_DIR/rs.db"

SECRET="parity-harness-secret-key-base-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"
COMMON=(
  SECRET_KEY_BASE="$SECRET"
  SCANNER_BUNDLE_SOURCE=off
  MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_PER_IP=100000
  MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_GLOBAL=100000
)

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT

(cd "$ELIXIR_DIR" && exec env "${COMMON[@]}" MIX_ENV=prod DATABASE_PATH="$PARITY_DIR/ex.db" \
  DATA_DIR="$PARITY_DIR/ex-data" PHX_HOST=localhost PORT=4100 PHX_SERVER=true \
  MANAVAULT_AUTH_DISABLED=true MISE_ENABLE_TOOLS=elixir,erlang mise exec -- mix phx.server) >"$PARITY_DIR/elixir.log" 2>&1 &
PIDS+=($!)
(cd "$ROOT/rust" && exec env "${COMMON[@]}" MANAVAULT_ENV=dev MANAVAULT_ROOT="$ROOT" \
  DATABASE_PATH="$PARITY_DIR/rs.db" DATA_DIR="$PARITY_DIR/rs-data" PORT=4200 \
  MANAVAULT_JOBS_DISABLED=1 MANAVAULT_VITE_DISABLED=1 "$RUST_BIN") >"$PARITY_DIR/rust.log" 2>&1 &
PIDS+=($!)

for port in 4100 4200; do
  for attempt in $(seq 1 240); do
    if curl -s -m 2 -o /dev/null "http://localhost:$port/settings"; then break; fi
    if [[ "$attempt" == 240 ]]; then
      echo "server on port $port did not start; see $PARITY_DIR/*.log" >&2
      exit 2
    fi
    sleep 0.5
  done
done

status=0
node "$ROOT/rust/scripts/parity/run.mjs" --elixir http://localhost:4100 --rust http://localhost:4200 \
  --elixir-db "$PARITY_DIR/ex.db" --rust-db "$PARITY_DIR/rs.db" "${HARNESS_ARGS[@]}" || status=$?
exit "$status"
