# lukethomas gateway for Bytebot desktops

Puts auth in front of one Bytebot desktop (`ghcr.io/bytebot-ai/bytebot-desktop`) and exposes:

| Path | Who | Auth |
|---|---|---|
| `/` | You: live desktop, take control any time (noVNC) | Basic auth `CUSTOM_USER` / `PASSWORD` |
| `/mcp` | The agent: 16 computer tools (screenshot, click, type, files, apps) | `Authorization: Bearer <MCP_TOKEN>` |

The desktop itself must have no public domain; the gateway reaches it on the private network
(`DESKTOP_URL`, e.g. `http://desktop-atlas.railway.internal:9990`).

Credentials: sign in to 1Password (preinstalled on the desktop) once per computer, with a shared vault.
Several computers can use the same vault, and a vault can hold several logins for the same service.
