#!/usr/bin/env bash
# Development stack for the Rust backend: what `mix phx.server` runs through
# Phoenix watchers, as three processes.
#
# - the `manavault` server (MANAVAULT_ENV=dev) on $PORT (default 4000),
# - the Vite dev server on 5173, which proxies backend routes to $PORT
#   (vite.config.ts) and serves the React module graph,
# - Tailwind in watch mode, writing priv/static/assets/css/app.css.
#
# The script exits (and stops the other two) as soon as any of them exits.
# Tools come from mise; run it as `mise run dev` or `mise exec -- scripts/dev-rust.sh`.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export PORT="${PORT:-4000}"
export MANAVAULT_ENV="${MANAVAULT_ENV:-dev}"
export MANAVAULT_ROOT="$repo_root"

for tool in cargo aube tailwindcss; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    if [[ -n "${MANAVAULT_DEV_RUST_REEXEC:-}" ]]; then
      echo "$tool is unavailable; run \`mise install\` first" >&2
      exit 1
    fi
    export MANAVAULT_DEV_RUST_REEXEC=1
    exec mise exec -- "$0" "$@"
  fi
done

# Compile before starting anything so a build error does not leave Vite running
# without a backend.
echo "==> Building the Rust backend"
(cd rust && cargo build --locked --bin manavault)

pids=()

stop_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    stop_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT
  trap "" INT TERM
  local pid
  for pid in "${pids[@]}"; do
    stop_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> Starting the Rust backend on port $PORT"
"$repo_root/rust/target/debug/manavault" serve &
pids+=("$!")

echo "==> Starting the Vite dev server on port 5173 (proxying to $PORT)"
aube run dev &
pids+=("$!")

echo "==> Starting Tailwind in watch mode"
# `--watch=always` keeps watching when stdin is closed (supervised services).
tailwindcss --input=assets/css/app.css --output=priv/static/assets/css/app.css --watch=always &
pids+=("$!")

status=0
wait -n "${pids[@]}" || status=$?
echo "==> A development process exited (status $status); stopping the others" >&2
exit "$status"
