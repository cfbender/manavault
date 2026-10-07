#!/bin/sh
# Cargo's linker on Linux (rust/.cargo/config.toml): links with mold, or with
# lld, when installed, and otherwise with the system linker, so builds work
# without either. `.agents/setup` installs mold.
if command -v mold >/dev/null 2>&1; then
  exec cc -fuse-ld=mold "$@"
elif command -v ld.lld >/dev/null 2>&1; then
  exec cc -fuse-ld=lld "$@"
else
  exec cc "$@"
fi
