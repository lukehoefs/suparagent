// Live data for pages agents make (components/CustomPage.tsx). A page runs in a sandboxed frame with
// an opaque origin, so it has no sign-in of its own. It asks this app for data with postMessage, and
// the app answers from a fixed list of read-only sources, made with the viewer's own session (so a
// viewer only gets what they could see anyway) and trimmed to plain fields.
//
// Because a page now holds real data, it is also cut off from the network: a Content-Security-Policy
// put first in its <head> allows no fetch, XHR, WebSocket or beacon (connect-src 'none'), no form
// posts, and images only from data: and blob:, so nothing it reads can be sent anywhere. Scripts,
// styles and fonts may still come from the usual public CDNs. The frame also has no allow-popups, so
// it cannot open a new tab with data in the address. A page's own CSP can only narrow this further.
//
// In the page:  await lukethomas.get("tasks")  ·  lukethomas.watch("running", rows => ..., 30)
// No React imports here, so node tests can load it.

type Row = Record<string, unknown>;
export type PageResource = {
  // The API path (GET only) and what a page gets back from it.
  path: string;
  shape: (raw: unknown) => unknown;
  // One line for the agent's tool description (backend app/ui/mcp_server.py repeats it).
  about: string;
};

const list = (raw: unknown, key?: string): Row[] => {
  const value = key && raw && typeof raw === "object" ? (raw as Row)[key] : raw;
  return Array.isArray(value) ? (value.filter((row) => row && typeof row === "object") as Row[]) : [];
};
const pick = (row: Row, keys: readonly string[]): Row =>
  Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
const text = (value: unknown, limit: number) => (typeof value === "string" ? value.slice(0, limit) : value ?? null);

export const PAGE_RESOURCES: Record<string, PageResource> = {
  agents: {
    path: "/agents",
    shape: (raw) => list(raw).map((row) => pick(row, ["id", "name", "title", "provider", "model", "pinned"])),
    about: "agents: [{id, name, title, provider, model, pinned}]",
  },
  running: {
    path: "/today/running",
    shape: (raw) =>
      list(raw).map((row) => ({
        ...pick(row, ["thread_id", "agent_id", "kind", "title", "started_at", "room_id"]),
        waiting_approvals: Array.isArray(row.approvals) ? row.approvals.length : 0,
      })),
    about: "running: what agents are doing now [{thread_id, agent_id, kind, title, started_at, waiting_approvals}]",
  },
  needs_you: {
    path: "/needs-you",
    shape: (raw) =>
      list(raw, "items").map((row) => ({ ...pick(row, ["kind", "title", "at", "thread_id", "routine_id", "work_item_id"]), detail: text(row.detail, 300) })),
    about: "needs_you: what waits for the person [{kind, title, detail, at, thread_id}]",
  },
  tasks: {
    path: "/planner/board",
    shape: () => null, // replaced by loadResource: tasks need the board first (two requests)
    about: "tasks: the task board [{id, title, column, priority, due_date, agent_id, completed_at, execution_state}]",
  },
  routines: {
    path: "/routines",
    shape: (raw) => list(raw).map((row) => pick(row, ["id", "agent_id", "name", "paused", "next_run_at", "timezone"])),
    about: "routines: [{id, agent_id, name, paused, next_run_at}]",
  },
  routine_runs: {
    path: "/routines/runs?limit=100",
    shape: (raw) =>
      list(raw).map((row) => ({
        ...pick(row, ["id", "routine_id", "trigger", "state", "outcome", "started_at", "finished_at", "thread_id"]),
        result: text(row.result, 500),
        error: text(row.error, 300),
      })),
    about: "routine_runs: the latest 100 [{id, routine_id, state, outcome, started_at, finished_at, result, error}]",
  },
  usage: {
    path: "/usage",
    shape: (raw) => {
      const usage = raw && typeof raw === "object" ? (raw as Row) : {};
      const totals = (row: Row) => pick(row, ["key", "label", "turns", "input_tokens", "output_tokens", "cost_usd"]);
      return {
        month: usage.month ?? null,
        total: usage.total && typeof usage.total === "object" ? totals(usage.total as Row) : null,
        by_day: list(usage.by_day).map(totals),
        by_engine: list(usage.by_engine).map(totals),
      };
    },
    about: "usage: this month's totals {month, total, by_day[], by_engine[]} with turns, tokens and cost_usd (owner and admins only)",
  },
};

export const PAGE_RESOURCE_NAMES = Object.keys(PAGE_RESOURCES);

/** One source's data, from the app's API with the viewer's session. `fetchJson` is lib/api.ts request. */
export async function loadResource(name: string, fetchJson: (path: string) => Promise<unknown>): Promise<unknown> {
  const resource = Object.prototype.hasOwnProperty.call(PAGE_RESOURCES, name) ? PAGE_RESOURCES[name] : undefined;
  if (!resource) throw new Error(`Unknown data "${name}". Available: ${PAGE_RESOURCE_NAMES.join(", ")}.`);
  if (name === "tasks") {
    const board = (await fetchJson("/planner/board")) as { id?: unknown; columns?: unknown };
    const columns = new Map(list(board?.columns).map((col) => [col.id, col.name]));
    const items = await fetchJson(`/planner/items?board_id=${Number(board?.id)}&archived=false`);
    return list(items).map((row) => ({
      ...pick(row, ["id", "title", "priority", "due_date", "due_at", "agent_id", "completed_at", "execution_state", "updated_at"]),
      column: columns.get(row.column_id) ?? null,
      description: text(row.description, 500),
    }));
  }
  return resource.shape(await fetchJson(resource.path));
}

// -- messages between the page and the app -------------------------------------------------

export type PageRequest = { lt: "req"; id: number; resource: string };
export type PageResponse = { lt: "res"; id: number; ok: boolean; data?: unknown; error?: string };

export function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== "object") return false;
  const msg = value as Row;
  return msg.lt === "req" && typeof msg.id === "number" && Number.isFinite(msg.id) && typeof msg.resource === "string" && msg.resource.length <= 40;
}

/** At most `limit` requests in any `windowMs`, per page: a runaway loop cannot flood the API. */
export function rateLimiter(limit = 60, windowMs = 60_000, now: () => number = Date.now) {
  const times: number[] = [];
  return () => {
    const at = now();
    while (times.length && at - times[0] >= windowMs) times.shift();
    if (times.length >= limit) return false;
    times.push(at);
    return true;
  };
}

// -- what goes into the page --------------------------------------------------------------

const CDNS = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com";
export const PAGE_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDNS}`,
  `style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com`,
  `font-src data: ${CDNS} https://fonts.gstatic.com`,
  "img-src data: blob:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

// The page's side: lukethomas.get(name) and lukethomas.watch(name, callback, seconds).
export const PAGE_HELPER = `(function(){var n=0,w={};addEventListener("message",function(e){var m=e.data;if(e.source!==parent||!m||m.lt!=="res"||!w[m.id])return;var p=w[m.id];delete w[m.id];m.ok?p[0](m.data):p[1](new Error(m.error||"failed"))});function get(r){return new Promise(function(ok,no){var id=++n;w[id]=[ok,no];parent.postMessage({lt:"req",id:id,resource:String(r)},"*");setTimeout(function(){if(w[id]){delete w[id];no(new Error("timed out"))}},20000)})}function watch(r,cb,s){var t,stop=false;function tick(){get(r).then(function(d){if(!stop)cb(d,null)},function(x){if(!stop)cb(null,x)}).then(function(){if(!stop)t=setTimeout(tick,Math.max(15,Number(s)||30)*1000)})}tick();return function(){stop=true;clearTimeout(t)}}window.lukethomas={get:get,watch:watch,resources:${JSON.stringify(PAGE_RESOURCE_NAMES)}}})();`;

/** The page's HTML with the policy and helper as its very first elements. Put before anything else
 *  (after a leading doctype only), the parser opens <html> and <head> for them, so they always land in
 *  the real head whatever the page writes later: a <head> hidden in a comment or a script string cannot
 *  move the policy out of effect. The page's own <html> and <head> tags then only add attributes. */
export function preparePageHtml(html: string): string {
  const inject = `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}"><script>${PAGE_HELPER}</script>`;
  const doctype = /^﻿?\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + inject + html.slice(doctype[0].length) : "<!doctype html>" + inject + html;
}
