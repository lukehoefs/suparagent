# lukethomas agent computer (desktop image)

Bytebot desktop with:
- macOS-style look: WhiteSur theme, icons and cursors, top menu bar, Plank dock, window buttons on the left, Inter font.
- Bitwarden force-installed in Firefox, pointed at https://vault.lthops.tech (Firefox's own password saving off).
- Persistent profile: mount a volume at `/persist` (Firefox incl. Bitwarden, 1Password, Desktop/Documents/Downloads).

Deploy one per agent behind `computers/bytebot-gateway`. The desktop needs no public domain.
