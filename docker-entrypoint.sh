#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"

mkdir -p \
  "$DATA_DIR" \
  "$DATA_DIR/uploads/scans" \
  "$DATA_DIR/cache/scryfall" \
  "$DATA_DIR/backups"

if [ "$(stat -c %U "$DATA_DIR")" = "app" ]; then
  # Already app-owned (normal restart): only fix the structural dirs the mkdir
  # above may have created, never re-walk the whole tree — the Scryfall image
  # cache under $DATA_DIR/cache can hold tens of thousands of files.
  chown app:app \
    "$DATA_DIR" \
    "$DATA_DIR/uploads" \
    "$DATA_DIR/uploads/scans" \
    "$DATA_DIR/cache" \
    "$DATA_DIR/cache/scryfall" \
    "$DATA_DIR/backups"
else
  # Fresh or externally-owned volume: take ownership once.
  chown -R app:app "$DATA_DIR"
fi

exec su-exec app "$@"
