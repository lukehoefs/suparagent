# lukethomas agent computer: Bytebot desktop + macOS-style look + Bitwarden + persistent profile.
FROM ghcr.io/bytebot-ai/bytebot-desktop:edge
USER root

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      plank dconf-cli fonts-inter git sassc libglib2.0-dev-bin libxml2-utils gtk2-engines-murrine gnome-themes-extra \
 && git clone --depth 1 https://github.com/vinceliuice/WhiteSur-gtk-theme.git /tmp/ws \
 && /tmp/ws/install.sh -d /usr/share/themes -c light \
 && git clone --depth 1 https://github.com/vinceliuice/WhiteSur-icon-theme.git /tmp/wi \
 && /tmp/wi/install.sh -d /usr/share/icons \
 && git clone --depth 1 https://github.com/vinceliuice/WhiteSur-cursors.git /tmp/wc \
 && cp -r /tmp/wc/dist /usr/share/icons/WhiteSur-cursors \
 && rm -rf /tmp/ws /tmp/wi /tmp/wc /var/lib/apt/lists/*

COPY rootfs/ /
COPY start-dock.sh /usr/local/bin/start-dock.sh
COPY entrypoint.sh /usr/local/bin/lukethomas-entrypoint.sh
RUN chmod +x /usr/local/bin/start-dock.sh /usr/local/bin/lukethomas-entrypoint.sh \
 && mkdir -p /etc/firefox/policies /usr/lib/firefox/distribution \
 && cp /etc/firefox/policies/policies.json /usr/lib/firefox/distribution/policies.json \
 && chown -R user:user /home/user/.config

EXPOSE 9990
CMD ["/usr/local/bin/lukethomas-entrypoint.sh"]
