# syntax=docker/dockerfile:1

# The production image runs the Rust backend (`rust/`, binary `manavault`) and
# serves the React frontend built from `assets/`. The Elixir app is not part of
# the image; its migrations stay the schema source through
# priv/repo/structure.sql, which the binary embeds.

ARG DEBIAN_RELEASE=trixie
ARG NODE_VERSION=22.23.2
# Keep RUST_VERSION in step with mise.toml.
ARG RUST_VERSION=1.99.0
ARG AUBE_VERSION=1.21.0
# Keep TAILWIND_VERSION in step with config/config.exs and mise.toml.
ARG TAILWIND_VERSION=4.3.0
ARG MANAVAULT_ASSET_VERSION

FROM node:${NODE_VERSION}-${DEBIAN_RELEASE}-slim AS frontend

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# aube is the JavaScript package manager used by the repo (pnpm-compatible) and
# Tailwind's standalone CLI builds the stylesheet. Pin both releases and verify
# their checksums instead of piping a remote installer to the shell. Update a
# version and its checksums together (aube's musl builds are static).
ARG TARGETARCH
ARG AUBE_VERSION
ARG AUBE_SHA256_AMD64=6761c69514475a87b375d02a3782ebbab1dfdf181a584ee6b6c91814a882cb37
ARG AUBE_SHA256_ARM64=07da9245c5ac2ef540ed59f795aeee6986d8a9ed5127d4d9c97cbfd1cc05c308
ARG TAILWIND_VERSION
ARG TAILWIND_SHA256_AMD64=73f0e5459054e5cfaa8ab6f3b940f3fbe0f13cc7fd83bc24e7c655033c203400
ARG TAILWIND_SHA256_ARM64=8f48dcb72be3b351c10563c5329b4638ba8516820dc3b3a1609625a166e87cbd
RUN set -eu; \
  arch="${TARGETARCH:-$(uname -m)}"; \
  case "$arch" in \
    amd64|x86_64) aube_arch=x86_64; aube_sha="$AUBE_SHA256_AMD64"; tw_arch=x64; tw_sha="$TAILWIND_SHA256_AMD64" ;; \
    arm64|aarch64) aube_arch=aarch64; aube_sha="$AUBE_SHA256_ARM64"; tw_arch=arm64; tw_sha="$TAILWIND_SHA256_ARM64" ;; \
    *) echo "unsupported build arch: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/aubepkg/aube/releases/download/v${AUBE_VERSION}/aube-v${AUBE_VERSION}-${aube_arch}-unknown-linux-musl.tar.gz" -o /tmp/aube.tar.gz; \
  echo "${aube_sha}  /tmp/aube.tar.gz" | sha256sum -c -; \
  tar -xzf /tmp/aube.tar.gz -C /tmp aube; \
  install /tmp/aube /usr/local/bin/aube; \
  curl -fsSL "https://github.com/tailwindlabs/tailwindcss/releases/download/v${TAILWIND_VERSION}/tailwindcss-linux-${tw_arch}" -o /tmp/tailwindcss; \
  echo "${tw_sha}  /tmp/tailwindcss" | sha256sum -c -; \
  install /tmp/tailwindcss /usr/local/bin/tailwindcss; \
  rm -f /tmp/aube /tmp/aube.tar.gz /tmp/tailwindcss; \
  aube --version; \
  tailwindcss --help | head -n 1

WORKDIR /app

# Install JavaScript packages before copying the sources, so they stay cached
# until the lockfile changes.
COPY package.json aube-lock.yaml ./
RUN aube install --frozen-lockfile

COPY vite.config.ts codegen.ts capacitor.config.json ./
COPY assets assets
COPY priv/static priv/static
# assets/css/app.css also scans the server-rendered templates for class names.
COPY lib/manavault_web/controllers lib/manavault_web/controllers

# The same outputs as `mix assets.deploy`: minified CSS, the Vite bundle, and
# gzip siblings for the extensions Phoenix precompresses (the server sends a
# `.gz` sibling to clients that accept gzip). Digested copies are not needed:
# the shell busts caches with `?v=MANAVAULT_ASSET_VERSION`.
RUN tailwindcss --input=assets/css/app.css --output=priv/static/assets/css/app.css --minify \
  && aube run build \
  && find priv/static -type f \
    \( -name '*.js' -o -name '*.map' -o -name '*.css' -o -name '*.txt' -o -name '*.html' \
       -o -name '*.json' -o -name '*.svg' -o -name '*.eot' -o -name '*.ttf' \) \
    -exec gzip -9 -k -n -f {} +

FROM rust:${RUST_VERSION}-slim-${DEBIAN_RELEASE} AS backend

WORKDIR /src
# Query macros read the committed rust/.sqlx metadata; no database is needed.
ENV SQLX_OFFLINE=true \
  CARGO_INCREMENTAL=0 \
  CARGO_TERM_COLOR=never

COPY rust rust
# Embedded at compile time (include_str!).
COPY priv/repo/structure.sql priv/repo/structure.sql
COPY priv/data priv/data

WORKDIR /src/rust
RUN --mount=type=cache,target=/usr/local/cargo/registry \
  --mount=type=cache,target=/usr/local/cargo/git \
  --mount=type=cache,target=/src/rust/target \
  cargo build --release --locked --bin manavault \
  && install -D target/release/manavault /out/manavault

FROM golang:1.26.8-alpine3.24 AS healthcheck-builder
# A static healthcheck helper, so the runtime image does not need curl. It
# only reports whether the server answers GET /health; background sync status
# does not affect it.
WORKDIR /src/healthcheck
COPY <<'EOF' main.go
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}
	client := http.Client{Timeout: 4 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "health check returned", response.Status)
		os.Exit(1)
	}
}
EOF
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /go/bin/manavault-healthcheck main.go

FROM rust:1.98.0-alpine3.24 AS preview-builder
# Public share-preview PNGs are rendered with the resvg CLI (a static musl
# build), which avoids the GLib/GIO and Cairo dependencies of rsvg-convert.
RUN apk add --no-cache musl-dev \
  && cargo install resvg --version 0.48.1 --locked

FROM debian:${DEBIAN_RELEASE}-slim AS runner

ARG MANAVAULT_ASSET_VERSION

# fonts-dejavu-core: share-preview text; tini: forwards signals and reaps
# renderer subprocesses.
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=healthcheck-builder /go/bin/manavault-healthcheck /usr/local/bin/manavault-healthcheck
COPY --from=preview-builder /usr/local/cargo/bin/resvg /usr/local/bin/resvg

ENV LANG=C.UTF-8
ENV LANGUAGE=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app
RUN groupadd --system app \
  && useradd --system --gid app --home-dir /home/app --create-home --shell /usr/sbin/nologin app \
  && mkdir -p /data \
  && chown app:app /data

ENV MANAVAULT_ENV=prod
ENV PORT=4000
ENV DATA_DIR=/data
ENV DATABASE_PATH=/data/manavault.db
ENV MANAVAULT_ROOT=/app
ENV MANAVAULT_STATIC_DIR=/app/priv/static
ENV MANAVAULT_ASSET_VERSION=${MANAVAULT_ASSET_VERSION}

COPY --from=frontend /app/priv/static /app/priv/static
COPY --from=backend /out/manavault /app/bin/manavault
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
  && /app/bin/manavault hash-password healthcheck >/dev/null

EXPOSE 4000
VOLUME ["/data"]
# The server shuts down gracefully on SIGINT.
STOPSIGNAL SIGINT
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["/usr/local/bin/manavault-healthcheck"]
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["/app/bin/manavault", "serve"]
