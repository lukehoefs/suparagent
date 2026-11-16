#!/bin/sh
# Keeps the agent's profile on the /persist volume (Firefox incl. Bitwarden, 1Password, files),
# then starts the desktop exactly as the Bytebot image does.
set -u
mkdir -p /persist
for p in .mozilla:mozilla .config/1Password:config-1password Desktop:Desktop Documents:Documents Downloads:Downloads; do
  d="/home/user/${p%%:*}"; t="/persist/${p#*:}"
  mkdir -p "$t" "$(dirname "$d")"
  if [ ! -L "$d" ]; then
    if [ -d "$d" ] && [ -z "$(ls -A "$t")" ]; then cp -a "$d"/. "$t"/ 2>/dev/null || true; fi
    rm -rf "$d"; ln -s "$t" "$d"
  fi
done
chown -R user:user /persist /home/user/.config 2>/dev/null || true
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf -n
