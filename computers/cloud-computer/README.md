# lukethomas cloud computer

One per agent. A Chromium desktop you can watch and take over in your browser, and the agent drives the
same browser through MCP. Deployed on Railway (or anywhere Docker runs).

| Path | Who | Auth |
|---|---|---|
| `/` | You: the live desktop, take control any time | Basic auth (`CUSTOM_USER` / `PASSWORD`) |
| `/mcp` | The agent (lukethomas custom MCP server) | `Authorization: Bearer <MCP_TOKEN>` |
| `/healthz` | Health check | none |

Variables: `CUSTOM_USER`, `PASSWORD` (12+ chars), `MCP_TOKEN` (24+ chars), `PORT` (default 8080).
Without them the computer refuses to expose anything. Mount a volume at `/config` so sign-ins persist.

Connect in lukethomas: Apps → MCP Marketplace → Custom MCP servers → address `https://<domain>/mcp`,
sign-in "Bearer token", paste `MCP_TOKEN`, Test, turn on, grant tools to the agent.

Notes: if you close Chromium on the desktop the agent loses the browser; restart the service to bring it
back. Anyone with the desktop password has a root terminal inside this container, so keep it private.
