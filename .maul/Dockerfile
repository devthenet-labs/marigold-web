# Copyright 2026 DevTheNet Labs.
# SPDX-License-Identifier: MIT
# The agent's toolchain image: maul's agent base plus the pinned Go
# toolchain and Node.js, offline. Application source is never baked into it.
FROM golang:1.26.6@sha256:0d1d3a794be25f809dd2cb3160d8c73276c4056a9f8242a138e908ddeee7b6b6 AS toolchain
FROM ghcr.io/devthenet-labs/maul/agent-base:v0.13.0
USER 0:0
COPY --from=toolchain /usr/local/go /usr/local/go
RUN mkdir -p /usr/local/bin \
    && ln -s /usr/local/go/bin/go /usr/local/bin/go \
    && ln -s /usr/local/go/bin/gofmt /usr/local/bin/gofmt \
    && mkdir -p /opt/go/pkg/mod
ENV GOTOOLCHAIN=local GOMODCACHE=/opt/go/pkg/mod GOPROXY=off CGO_ENABLED=0
WORKDIR /tmp/deps
COPY go.mod ./
RUN go mod download

# Node.js 22, the line CI's runner image provides, for the script's and the
# publishers' tests (`node --test ...`). They use only Node's built-ins, so
# there is no package.json and nothing to `npm ci`: npm is here for the
# agent's convenience, offline, so it fails fast rather than hanging on a
# fetch, and keeps its cache in the writable /tmp.
# hadolint ignore=DL3018
RUN apk add --no-cache nodejs-22 npm
ENV npm_config_offline=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false \
    npm_config_cache=/tmp/.cache/npm

LABEL org.opencontainers.image.source="https://github.com/devthenet-labs/marigold-web" \
      org.opencontainers.image.title="marigold-web agent toolchain"
WORKDIR /workspace
USER 65532:65532
