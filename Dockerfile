# Multi-stage build for the regional-lease Core.
# The runtime base is the same pinned mihomo image used by the local deployment.
FROM golang:1.27 AS build
WORKDIR /src
COPY core/ ./core/
WORKDIR /src/core
ARG VERSION=1.0.18-regional-lease.1
RUN CGO_ENABLED=0 go build -buildvcs=false -trimpath \
    -ldflags="-s -w -X github.com/armanlife/arman-vpn-client/core/internal/version.Current=${VERSION}" \
    -o /out/firefox-vpn-core ./cmd/arman-vpn-core

FROM metacubex/mihomo@sha256:9211361a3ed85305383288d38c05e85862d6d5a590c10007c37fc059cca82e9c
LABEL org.opencontainers.image.title="Firefox VPN Core with scoped native regional lease" \
      org.opencontainers.image.version="1.0.18-regional-lease.1" \
      org.opencontainers.image.source="https://github.com/qingwo1991-debug/arman-vpn-client"
COPY --from=build --chmod=0555 /out/firefox-vpn-core /usr/local/bin/firefox-vpn-core
ENV HOME=/data NO_COLOR=1
USER 10001:10001
WORKDIR /data
ENTRYPOINT ["/usr/local/bin/firefox-vpn-core"]
CMD ["-plain", "-data-dir", "/data"]
