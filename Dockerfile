# syntax=docker/dockerfile:1

ARG ELIXIR_VERSION=1.20.1
ARG OTP_VERSION=29
ARG DEBIAN_VERSION=trixie-slim
ARG NODE_VERSION=22.22.2
ARG AUBE_VERSION=1.21.0
ARG OCR_REQUIREMENTS=requirements-ocr.txt

ARG BUILDER_IMAGE=elixir:${ELIXIR_VERSION}-otp-${OTP_VERSION}-slim
ARG RUNNER_IMAGE=debian:${DEBIAN_VERSION}

FROM ${BUILDER_IMAGE} AS builder

ARG NODE_VERSION
ARG AUBE_VERSION

ENV MISE_DATA_DIR=/mise
ENV MISE_CACHE_DIR=/mise/cache
ENV PATH="/mise/installs/node/${NODE_VERSION}/bin:/mise/installs/aube/${AUBE_VERSION}:${PATH}"

RUN apt-get update -y && apt-get install -y build-essential git curl ca-certificates xz-utils \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN curl https://mise.run | sh \
  && printf '[tools]\nnode = "%s"\naube = "%s"\n' "$NODE_VERSION" "$AUBE_VERSION" > .mise.toml \
  && /root/.local/bin/mise install -y

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=prod

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

FROM golang:1.25.11-bookworm AS gosu-builder
# Build gosu with a patched Go toolchain. Debian's apt gosu is built with
# go1.24.4, which carries ~30 Critical/High stdlib CVEs. Building from source
# with Go 1.25.11 (>= every fixed-in version in the scan) eliminates them all
# while keeping gosu's behavior identical.
RUN CGO_ENABLED=0 go install github.com/tianon/gosu@latest

FROM ${RUNNER_IMAGE} AS runner

ARG OCR_REQUIREMENTS

RUN apt-get update -y && apt-get upgrade -y && apt-get install -y libstdc++6 openssl libncurses6 locales ca-certificates curl libsctp1 python3 python3-venv libgomp1 libgl1 libglib2.0-0t64 libxcb1 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=gosu-builder /go/bin/gosu /usr/local/bin/gosu

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

WORKDIR /app
RUN useradd --create-home --shell /bin/sh app && mkdir -p /data && chown -R app:app /app /data

ENV MIX_ENV=prod
ENV PHX_SERVER=true
ENV PORT=4000
ENV DATA_DIR=/data
ENV DATABASE_PATH=/data/manavault.db

COPY requirements-ocr*.txt ./
RUN python3 -m venv /app/.venv \
  && /app/.venv/bin/python -m ensurepip --upgrade \
  && /app/.venv/bin/python -m pip install --no-cache-dir --upgrade pip \
  && /app/.venv/bin/python -m pip install --no-cache-dir -r "${OCR_REQUIREMENTS}"

COPY --from=builder --chown=app:app /app/_build/prod/rel/manavault ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chown -R app:app /app && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS "http://127.0.0.1:${PORT:-4000}/health" || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/app/bin/manavault", "start"]
