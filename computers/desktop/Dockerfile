# lukethomas agent computer: Bytebot desktop + macOS-style look + Bitwarden + persistent profile.
FROM ghcr.io/bytebot-ai/bytebot-desktop:edge
USER root

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      plank dconf-cli fonts-inter arc-theme papirus-icon-theme \
 && rm -rf /var/lib/apt/lists/*

COPY rootfs/ /
COPY start-dock.sh /usr/local/bin/start-dock.sh
COPY entrypoint.sh /usr/local/bin/lukethomas-entrypoint.sh
RUN chmod +x /usr/local/bin/start-dock.sh /usr/local/bin/lukethomas-entrypoint.sh \
 && mkdir -p /etc/firefox/policies /usr/lib/firefox/distribution \
 && cp /etc/firefox/policies/policies.json /usr/lib/firefox/distribution/policies.json \
 && chown -R user:user /home/user/.config

EXPOSE 9990
CMD ["/usr/local/bin/lukethomas-entrypoint.sh"]
