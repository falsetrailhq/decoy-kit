# Caddy with the Cloudflare DNS module, for one wildcard certificate (see docker-compose.wildcard.yml).
# Built from the official Caddy builder image and the caddy-dns/cloudflare module.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
