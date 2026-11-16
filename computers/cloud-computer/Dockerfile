# lukethomas cloud computer: one per agent.
#
#   - A Chromium desktop streamed to your browser (linuxserver Selkies) that you can watch and take over.
#   - Playwright MCP attached to that SAME Chromium over CDP, so the agent and the person share one browser,
#     its tabs and its sign-ins.
#   - Caddy in front on $PORT: /mcp needs "Authorization: Bearer $MCP_TOKEN"; everything else is the
#     desktop, protected by basic auth (CUSTOM_USER / PASSWORD).
#   - /config is the persistent volume: the browser profile (logins, cookies) lives there.
#
# Required variables: CUSTOM_USER, PASSWORD, MCP_TOKEN. Optional: PORT (default 8080), START_URL.

FROM caddy:2.10-alpine AS caddy

FROM lscr.io/linuxserver/chromium:latest

ARG PLAYWRIGHT_MCP_VERSION=0.0.85

RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs npm curl ca-certificates \
 && npm install -g --no-audit --no-fund "@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}" \
 && npm cache clean --force \
 && apt-get autoclean && rm -rf /var/lib/apt/lists/* /tmp/*

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY custom-services.d/ /custom-services.d/
COPY custom-cont-init.d/ /custom-cont-init.d/
RUN chmod +x /custom-services.d/* /custom-cont-init.d/*

ENV TITLE="lukethomas computer" \
    PORT=8080 \
    CHROME_CLI="--user-data-dir=/config/agent-profile --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --disable-dev-shm-usage"

EXPOSE 8080
