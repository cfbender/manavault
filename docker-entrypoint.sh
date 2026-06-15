#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"

mkdir -p \
  "$DATA_DIR" \
  "$DATA_DIR/uploads/scans" \
  "$DATA_DIR/cache/scryfall" \
  "$DATA_DIR/backups"

chown -R app:app "$DATA_DIR"

exec gosu app "$@"
