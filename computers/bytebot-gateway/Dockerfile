# lukethomas gateway in front of one Bytebot desktop (one per agent).
#   /              noVNC viewer: watch and take over the desktop      (basic auth: CUSTOM_USER / PASSWORD)
#   /websockify    the desktop's VNC stream                            (basic auth)
#   /mcp           Bytebot's computer tools (Streamable HTTP MCP)     (Authorization: Bearer MCP_TOKEN)
#   /healthz       health check
# Required: DESKTOP_URL (e.g. http://desktop-atlas.railway.internal:9990), CUSTOM_USER, PASSWORD (12+), MCP_TOKEN (24+).
FROM caddy:2.10-alpine AS caddy

FROM alpine:3.20
ARG NOVNC_VERSION=v1.6.0
RUN apk add --no-cache git tini \
 && git clone --depth 1 --branch "${NOVNC_VERSION}" https://github.com/novnc/noVNC.git /srv/novnc \
 && rm -rf /srv/novnc/.git \
 && apk del git
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html /srv/novnc/index.html
COPY start.sh /start.sh
RUN chmod +x /start.sh
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/start.sh"]
