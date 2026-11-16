import assert from "node:assert/strict";
import { test } from "node:test";
import { agentChatHref, editAgentHref, newAgentHref, parseAgentId, parseAgentTab } from "./agent-pages.ts";

test("addresses use query strings and trailing slashes", () => {
  assert.equal(newAgentHref(), "/agents/new/");
  assert.equal(newAgentHref("loose-ends"), "/agents/new/?blueprint=loose-ends");
  assert.equal(editAgentHref(3), "/agents/edit/?id=3");
  assert.equal(editAgentHref(3, "soul"), "/agents/edit/?id=3&tab=soul");
});

test("ids and tabs are checked", () => {
  assert.equal(parseAgentId("12"), 12);
  assert.equal(parseAgentId("0"), null);
  assert.equal(parseAgentId("-1"), null);
  assert.equal(parseAgentId("1e3"), null);
  assert.equal(parseAgentId(null), null);
  assert.equal(parseAgentTab("memory"), "memory");
  assert.equal(parseAgentTab("routines"), "routines");
  assert.equal(editAgentHref(3, "routines"), "/agents/edit/?id=3&tab=routines");
  assert.equal(parseAgentTab("nope"), "profile");
  assert.equal(parseAgentTab(null), "profile");
});

test("chat opens the latest live conversation, or a new one", () => {
  const threads = [
    { id: 1, agent_id: 5, archived_at: null, updated_at: "2026-11-10T00:00:00Z" },
    { id: 2, agent_id: 5, archived_at: null, updated_at: "2026-11-12T00:00:00Z" },
    { id: 3, agent_id: 5, archived_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z" },
  ];
  assert.equal(agentChatHref(threads, 5), "/chat/?thread=2");
  assert.equal(agentChatHref(threads, 9), "/chat/?agent=9");
  assert.equal(agentChatHref(null, 9), "/chat/?agent=9");
});
