# syntax=docker/dockerfile:1

ARG ELIXIR_VERSION=1.20.1
ARG OTP_VERSION=29
ARG ALPINE_VERSION=3.23
ARG NODE_VERSION=22.22.2
ARG AUBE_VERSION=1.21.0
ARG MANAVAULT_ASSET_VERSION

ARG BUILDER_IMAGE=elixir:${ELIXIR_VERSION}-otp-${OTP_VERSION}-alpine
ARG RUNNER_IMAGE=alpine:${ALPINE_VERSION}

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-runtime

FROM ${BUILDER_IMAGE} AS builder

ARG AUBE_VERSION
ARG MANAVAULT_ASSET_VERSION
COPY --from=node-runtime /usr/local /usr/local

ENV MISE_DATA_DIR=/mise
ENV MISE_CACHE_DIR=/mise/cache
ENV PATH="/mise/installs/aube/${AUBE_VERSION}:/usr/local/bin:${PATH}"

RUN apk add --no-cache build-base git curl ca-certificates xz tar

WORKDIR /app

# Pin mise to a verified release instead of piping a remote installer to the
# shell (curl https://mise.run | sh), so a compromise of mise.run can't inject
# code into the build. Update MISE_VERSION + the checksums together.
ARG TARGETARCH
ARG MISE_VERSION=v2026.6.14
ARG MISE_SHA256_AMD64=491dd31ff1e0201c7866046f4110125392a481f0fd37e01e5e622fa12670b77b
ARG MISE_SHA256_ARM64=947541d82684732cf27327d0d1914b471c0edb5ed6db8507f81b4ad8b67ba7cf

RUN set -eu; \
  arch="${TARGETARCH:-$(uname -m)}"; \
  case "$arch" in \
    amd64|x86_64) mise_arch=x64; mise_sha="$MISE_SHA256_AMD64" ;; \
    arm64|aarch64) mise_arch=arm64; mise_sha="$MISE_SHA256_ARM64" ;; \
    *) echo "unsupported build arch: ${arch}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-${mise_arch}-musl.tar.gz" -o /tmp/mise.tar.gz; \
  echo "${mise_sha}  /tmp/mise.tar.gz" | sha256sum -c -; \
  tar -xzf /tmp/mise.tar.gz -C /tmp; \
  mv /tmp/mise/bin/mise /usr/local/bin/mise; \
  rm -rf /tmp/mise /tmp/mise.tar.gz; \
  printf '[tools]\naube = "%s"\n' "$AUBE_VERSION" > .mise.toml; \
  mise install -y

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=prod
ENV MANAVAULT_ASSET_VERSION=${MANAVAULT_ASSET_VERSION}

COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile

COPY priv priv
COPY lib lib
COPY package.json aube-lock.yaml vite.config.ts codegen.ts capacitor.config.ts ./
COPY assets assets

RUN aube install --frozen-lockfile
RUN mix compile
RUN mix assets.deploy

COPY config/runtime.exs config/
RUN mix release

FROM golang:1.25.11-alpine3.23 AS healthcheck-builder
# Build a static TCP healthcheck helper so the runtime image does not need curl
# and health is not coupled to background sync HTTP status.
WORKDIR /src/healthcheck
RUN printf '%s\n' \
  'package main' \
  '' \
  'import (' \
  '  "fmt"' \
  '  "net"' \
  '  "os"' \
  '  "time"' \
  ')' \
  '' \
  'func main() {' \
  '  port := os.Getenv("PORT")' \
  '  if port == "" {' \
  '    port = "4000"' \
  '  }' \
  '  conn, err := net.DialTimeout("tcp", "127.0.0.1:"+port, 4*time.Second)' \
  '  if err != nil {' \
  '    fmt.Fprintln(os.Stderr, err)' \
  '    os.Exit(1)' \
  '  }' \
  '  _ = conn.Close()' \
  '}' \
  > /tmp/manavault-healthcheck.go \
  && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /go/bin/manavault-healthcheck /tmp/manavault-healthcheck.go

FROM ${RUNNER_IMAGE} AS runner

ARG MANAVAULT_ASSET_VERSION

RUN apk upgrade --no-cache \
  && apk add --no-cache libstdc++ openssl ncurses-libs ca-certificates lksctp-tools su-exec rsvg-convert fontconfig ttf-dejavu

COPY --from=healthcheck-builder /go/bin/manavault-healthcheck /usr/local/bin/manavault-healthcheck

ENV LANG=C.UTF-8
ENV LANGUAGE=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app
RUN addgroup -S app && adduser -S -G app -h /home/app -s /bin/sh app && mkdir -p /data && chown -R app:app /app /data

ENV MIX_ENV=prod
ENV PHX_SERVER=true
ENV PORT=4000
ENV DATA_DIR=/data
ENV DATABASE_PATH=/data/manavault.db
ENV MANAVAULT_ASSET_VERSION=${MANAVAULT_ASSET_VERSION}

COPY --from=builder --chown=app:app /app/_build/prod/rel/manavault ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chown -R app:app /app && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["/usr/local/bin/manavault-healthcheck"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/app/bin/manavault", "start"]
