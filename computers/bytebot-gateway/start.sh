#!/bin/sh
set -eu
fail() { echo "[lukethomas gateway] $1" >&2; exec sleep infinity; }
[ -n "${DESKTOP_URL:-}" ] || fail "DESKTOP_URL is not set."
[ -n "${CUSTOM_USER:-}" ] || fail "CUSTOM_USER is not set."
[ "${#PASSWORD}" -ge 12 ] 2>/dev/null || fail "PASSWORD must be 12+ characters."
[ "${#MCP_TOKEN}" -ge 24 ] 2>/dev/null || fail "MCP_TOKEN must be 24+ characters."
export BASIC_AUTH_HASH="$(caddy hash-password --plaintext "$PASSWORD")"
export DESKTOP_HOSTPORT="$(echo "$DESKTOP_URL" | sed -E 's#^https?://##; s#/.*$##')"
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
