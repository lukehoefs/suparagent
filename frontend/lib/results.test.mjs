import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentsWithResults,
  boardTaskHref,
  downloadName,
  filterRows,
  groupRows,
  jobOutput,
  jobRows,
  jobTitle,
  latestTaskResult,
  needsYou,
  parseFilter,
  previewOf,
  RESULT_FILTERS,
  resultsHref,
  reviewColumns,
  routineHref,
  routineRows,
  rowAgent,
  rowOutput,
  sortRows,
  taskOutput,
  taskRows,
} from "./results.ts";

const board = {
  id: 1,
  name: "My tasks",
  columns: [
    { id: 10, key: "backlog", name: "Backlog", position: 0 },
    { id: 11, key: "doing", name: "In progress", position: 2 },
    { id: 14, key: "review", name: "Review", position: 4 },
    { id: 15, key: "done", name: "Done", position: 5 },
  ],
};

function task(over) {
  return {
    id: 1, column_id: 14, title: "Weekly content plan", description: "", agent_id: 3, team_id: null, thread_id: null,
    archived: false, completed_at: null, updated_at: "2026-11-17T09:00:00Z", revision: 2, execution_state: null, execution_thread_id: null,
    ...over,
  };
}

test("the Review and Done columns come from the board's fixed keys", () => {
  assert.deepEqual(reviewColumns(board), { review: 14, done: 15 });
  assert.deepEqual(reviewColumns({ columns: [] }), { review: null, done: null });
  assert.deepEqual(reviewColumns(null), { review: null, done: null });
});

test("tasks in Review need review; Done shows only agent or team work", () => {
  const rows = taskRows(board, [
    task({ id: 1 }),
    task({ id: 2, column_id: 15, completed_at: "2026-11-16T10:00:00Z" }),
    // A personal to-do moved to Done: nobody produced it.
    task({ id: 3, column_id: 15, completed_at: "2026-11-16T10:00:00Z", agent_id: null }),
    // Started from the board, then unassigned: still agent work.
    task({ id: 4, column_id: 15, completed_at: "2026-11-16T10:00:00Z", agent_id: null, execution_state: "completed" }),
    // Not finished and not in review.
    task({ id: 5, column_id: 11 }),
    task({ id: 6, archived: true }),
    // In the Done column without a completion time (should not happen): left out.
    task({ id: 7, column_id: 15, completed_at: null }),
  ]);
  assert.deepEqual(rows.map((row) => [row.key, row.status]), [["task:1", "review"], ["task:2", "done"], ["task:4", "done"]]);
  const [review, done] = rows;
  assert.equal(review.at, "2026-11-17T09:00:00Z");
  assert.equal(done.at, "2026-11-16T10:00:00Z");
  assert.equal(review.source, "task");
  assert.equal(review.taskId, 1);
  assert.equal(review.revision, 2);
  assert.equal(review.description, null);
});

test("a task opens the conversation its agent worked in, else the one it is linked to", () => {
  const [ran, linked, none] = taskRows(board, [
    task({ id: 1, execution_thread_id: 40, thread_id: 7 }),
    task({ id: 2, thread_id: 7 }),
    task({ id: 3 }),
  ]);
  assert.equal(ran.threadId, 40);
  assert.equal(linked.threadId, 7);
  assert.equal(none.threadId, null);
});

test("a task for the team shows the team's lead and name", () => {
  const team = { id: 5, name: "LH Tech", lead_agent_id: 9 };
  const [row] = taskRows(board, [task({ agent_id: null, team_id: 5, description: "Draft the plan" })], team);
  assert.equal(row.agentId, 9);
  assert.equal(row.teamId, 5);
  assert.equal(row.teamName, "LH Tech");
  assert.equal(row.description, "Draft the plan");
  // Another team (or none loaded): no lead to show, the row still says it is the team's.
  const [other] = taskRows(board, [task({ agent_id: null, team_id: 6 })], team);
  assert.equal(other.agentId, null);
  assert.equal(other.teamId, 6);
  assert.equal(other.teamName, null);
});

function run(over) {
  return {
    id: 1, routine_id: 20, trigger: "schedule", state: "completed", scheduled_for: "2026-11-17T07:35:00Z", thread_id: 30, turn_id: 1,
    outcome: "report", outcome_details: null, result: "Digest\nAll lines ran.", error: null, waiting_since: null, waited_seconds: 0,
    attempt: 1, retry_of: null, started_at: "2026-11-17T07:35:05Z", finished_at: "2026-11-17T07:40:00Z", created_at: "2026-11-17T07:35:00Z",
    ...over,
  };
}

test("routine runs: done, running or waiting; failures, quiet runs and task routines left out", () => {
  const routines = [{ id: 20, name: "Production digest", agent_id: 4 }];
  const rows = routineRows(routines, [
    run({ id: 1 }),
    run({ id: 2, state: "running", finished_at: null }),
    run({ id: 3, state: "queued", started_at: null, finished_at: null }),
    run({ id: 4, state: "needs_input", finished_at: null }),
    run({ id: 5, state: "failed" }),
    run({ id: 6, state: "missed" }),
    run({ id: 7, state: "skipped" }),
    run({ id: 8, state: "interrupted" }),
    run({ id: 9, outcome: "no_change" }),
    // A run of a routine GET /routines does not list: the board's hidden routine for a task.
    run({ id: 10, routine_id: 99 }),
  ], Date.parse("2026-11-17T08:00:00Z"));
  assert.deepEqual(rows.map((row) => [row.key, row.status]), [["run:1", "done"], ["run:2", "running"], ["run:3", "running"], ["run:4", "waiting"]]);
  const [done, running, queued] = rows;
  assert.equal(done.title, "Production digest");
  assert.equal(done.agentId, 4);
  assert.equal(done.source, "routine");
  assert.equal(done.threadId, 30);
  assert.equal(done.text, "Digest\nAll lines ran.");
  assert.equal(done.routineId, 20);
  assert.equal(done.runId, 1);
  assert.equal(done.at, "2026-11-17T07:40:00Z");
  assert.equal(running.at, "2026-11-17T07:35:05Z");
  assert.equal(queued.at, "2026-11-17T07:35:00Z");
  // An empty result is no output.
  assert.equal(routineRows(routines, [run({ result: "  " })])[0].text, null);
});

test("a queued run counts as running only once it is due; a retry waiting out its delay is left out", () => {
  const routines = [{ id: 20, name: "Production digest", agent_id: 4 }];
  const now = Date.parse("2026-11-17T09:05:00Z");
  const queued = (over) => run({ state: "queued", started_at: null, finished_at: null, result: null, outcome: null, ...over });
  const rows = routineRows(routines, [
    // The 09:00 run failed; its retry (routine_service._queue_retry) is queued for 09:30.
    run({ id: 1, state: "failed", scheduled_for: "2026-11-17T09:00:00Z", finished_at: "2026-11-17T09:01:00Z" }),
    queued({ id: 2, attempt: 2, retry_of: 1, scheduled_for: "2026-11-17T09:30:00Z", created_at: "2026-11-17T09:01:00Z" }),
    // Due (its time came) or already started: under way.
    queued({ id: 3, scheduled_for: "2026-11-17T09:05:00Z" }),
    queued({ id: 4, scheduled_for: "2026-11-17T09:40:00Z", started_at: "2026-11-17T09:04:00Z" }),
    // Queued with no time (run now): under way.
    queued({ id: 5, scheduled_for: null }),
  ], now);
  assert.deepEqual(rows.map((row) => [row.key, row.status]), [["run:3", "running"], ["run:4", "running"], ["run:5", "running"]]);
  // Once its time comes, the retry shows as running.
  assert.deepEqual(
    routineRows(routines, [queued({ id: 2, attempt: 2, retry_of: 1, scheduled_for: "2026-11-17T09:30:00Z" })], Date.parse("2026-11-17T09:30:00Z")).map((row) => row.status),
    ["running"],
  );
});

test("a row names its agent or team; nobody, removed and not-yet-loaded are told apart", () => {
  const names = new Map([[3, "Atlas"]]);
  const base = { agentId: null, teamId: null, teamName: null };
  assert.deepEqual(rowAgent({ ...base, agentId: 3 }, names), { kind: "name", name: "Atlas" });
  // A personal to-do in Review: no agent and no team.
  assert.deepEqual(rowAgent(base, names), { kind: "unassigned" });
  assert.deepEqual(rowAgent(base, null), { kind: "unassigned" });
  // Only an id the loaded agents lack is a removed agent.
  assert.deepEqual(rowAgent({ ...base, agentId: 9 }, names), { kind: "removed" });
  // GET /agents still loading or failed: not known, never "removed".
  assert.deepEqual(rowAgent({ ...base, agentId: 3 }, null), { kind: "unknown" });
  // A team's own name, else the word for a team, with or without the agents.
  assert.deepEqual(rowAgent({ agentId: 3, teamId: 6, teamName: "Ops" }, null), { kind: "name", name: "Ops" });
  assert.deepEqual(rowAgent({ agentId: null, teamId: 6, teamName: null }, names), { kind: "team" });
});

function job(over) {
  return {
    id: 1, root_id: 1, parent_id: null, depth: 1, kind: "job", requester_agent_id: 2, requester_thread_id: 50, assignee_agent_id: 3,
    assignee_thread_id: 51, mode: "work", brief: "## November freight read\nCompare the carriers.", status: "completed",
    created_at: "2026-11-17T08:00:00Z", started_at: "2026-11-17T08:00:01Z", finished_at: "2026-11-17T08:30:00Z", result: null,
    ...over,
  };
}

test("delegated work comes from chats and links to where it was asked", () => {
  const rows = jobRows([
    job({ id: 1 }),
    job({ id: 2, status: "running", finished_at: null }),
    job({ id: 3, status: "waiting", finished_at: null }),
    job({ id: 4, status: "resume", finished_at: null }),
    job({ id: 5, status: "queued", started_at: null, finished_at: null }),
    // A tool use in the working agent's chat waits for your approval.
    job({ id: 6, status: "needs_input", finished_at: null }),
    job({ id: 7, status: "failed" }),
    job({ id: 8, status: "cancelled" }),
    job({ id: 9, kind: "root" }),
    // A question waits for your answer, as Today lists it: it never reads as running.
    job({ id: 10, status: "needs_input", question: "Which month?", finished_at: null }),
  ]);
  assert.deepEqual(rows.map((row) => [row.key, row.status]), [
    ["job:1", "done"], ["job:2", "running"], ["job:3", "running"], ["job:4", "running"], ["job:5", "running"], ["job:6", "waiting"], ["job:10", "waiting"],
  ]);
  // A job with a question counts under Needs review.
  assert.equal(needsYou(rows.find((row) => row.key === "job:10")), true);
  const [done] = rows;
  assert.equal(done.source, "chat");
  assert.equal(done.title, "November freight read");
  assert.equal(done.agentId, 3);
  assert.equal(done.threadId, 50);
  assert.equal(done.workThreadId, 51);
  assert.equal(done.jobId, 1);
  assert.equal(done.at, "2026-11-17T08:30:00Z");
  // The list leaves the result out; when a detail carries one it is kept.
  assert.equal(done.text, null);
  assert.equal(jobRows([job({ result: "Carrier A wins." })])[0].text, "Carrier A wins.");
  // No separate work conversation to offer when it is the same one, or there is none.
  assert.equal(jobRows([job({ assignee_thread_id: 50 })])[0].workThreadId, null);
  const unrequested = jobRows([job({ requester_thread_id: null })])[0];
  assert.equal(unrequested.threadId, 51);
  assert.equal(unrequested.workThreadId, null);
});

test("job titles are the brief's first line, plain and short", () => {
  assert.equal(jobTitle("\n\n**Find** three carriers\nmore"), "Find three carriers");
  assert.equal(jobTitle("- Item one"), "Item one");
  assert.equal(jobTitle("x".repeat(200)).length, 90);
  assert.ok(jobTitle("x".repeat(200)).endsWith("…"));
  assert.equal(jobTitle(""), "");
});

function row(key, at, over = {}) {
  return {
    key, source: "routine", status: "done", title: key, agentId: 1, teamId: null, teamName: null, at, threadId: null, workThreadId: null,
    text: null, description: null, taskId: null, revision: null, routineId: null, runId: null, jobId: null, ...over,
  };
}

test("rows sort newest first, with a stable order for ties", () => {
  const sorted = sortRows([row("b", "2026-11-16T00:00:00Z"), row("a", "2026-11-17T00:00:00Z"), row("c", "2026-11-16T00:00:00Z"), row("d", "not a date")]);
  assert.deepEqual(sorted.map((r) => r.key), ["a", "b", "c", "d"]);
});

test("filters: needs you, source, agent, client and search words", () => {
  const rows = [
    row("task:1", "2026-11-17T00:00:00Z", { source: "task", status: "review", agentId: 1, title: "Weekly content plan" }),
    row("run:1", "2026-11-17T00:00:00Z", { source: "routine", status: "waiting", agentId: 2, title: "Digest" }),
    row("run:2", "2026-11-17T00:00:00Z", { source: "routine", status: "done", agentId: 2, title: "Digest", text: "Line 4 stopped twice" }),
    row("job:1", "2026-11-17T00:00:00Z", { source: "chat", status: "running", agentId: 3, title: "Freight read" }),
    row("task:2", "2026-11-17T00:00:00Z", { source: "task", status: "done", agentId: null, teamId: 5, teamName: "LH Tech", title: "Plan" }),
  ];
  const keys = (filter) => filterRows(rows, filter).map((r) => r.key);
  assert.deepEqual(keys({ filter: "all" }), ["task:1", "run:1", "run:2", "job:1", "task:2"]);
  assert.deepEqual(keys({ filter: "review" }), ["task:1", "run:1"]);
  assert.deepEqual(keys({ filter: "routines" }), ["run:1", "run:2"]);
  assert.deepEqual(keys({ filter: "chats" }), ["job:1"]);
  assert.deepEqual(keys({ filter: "all", agentId: 2 }), ["run:1", "run:2"]);
  assert.deepEqual(keys({ filter: "all", clientAgentIds: new Set([1, 3]) }), ["task:1", "job:1"]);
  assert.deepEqual(keys({ filter: "all", clientAgentIds: new Set() }), []);
  // Every word must appear somewhere: the title, the output, the agent's name or the team's.
  assert.deepEqual(keys({ filter: "all", query: "line  STOPPED" }), ["run:2"]);
  assert.deepEqual(keys({ filter: "all", query: "lh tech" }), ["task:2"]);
  assert.deepEqual(keys({ filter: "all", query: "verde", labelOf: (r) => (r.agentId === 3 ? "Verde" : "Atlas") }), ["job:1"]);
  assert.deepEqual(keys({ filter: "review", query: "digest" }), ["run:1"]);
});

test("needs you covers tasks to review and runs waiting on a question", () => {
  assert.equal(needsYou({ status: "review" }), true);
  assert.equal(needsYou({ status: "waiting" }), true);
  assert.equal(needsYou({ status: "running" }), false);
  assert.equal(needsYou({ status: "done" }), false);
});

test("the filter in the address falls back to all", () => {
  assert.equal(parseFilter("review"), "review");
  assert.equal(parseFilter("chats"), "chats");
  assert.equal(parseFilter("nope"), "all");
  assert.equal(parseFilter(null), "all");
  // The design has no "From tasks" chip: an old address with it opens on All, so the list is
  // never narrowed by a filter no chip shows.
  assert.equal(parseFilter("tasks"), "all");
  assert.deepEqual([...RESULT_FILTERS], ["all", "review", "routines", "chats"]);
});

test("rows group into today and earlier, by local midnight", () => {
  const now = new Date(2026, 10, 17, 15, 0).getTime();
  const rows = [
    row("a", new Date(2026, 10, 17, 9, 0).toISOString()),
    row("b", new Date(2026, 10, 17, 0, 0).toISOString()),
    row("c", new Date(2026, 10, 16, 23, 59).toISOString()),
  ];
  assert.deepEqual(groupRows(rows, now).map((g) => [g.key, g.rows.map((r) => r.key)]), [["today", ["a", "b"]], ["earlier", ["c"]]]);
  assert.deepEqual(groupRows(rows.slice(2), now).map((g) => g.key), ["earlier"]);
  assert.deepEqual(groupRows([], now), []);
});

test("a preview is a short heading and the first lines of the output", () => {
  assert.deepEqual(previewOf("# Weekly plan\n\n- Monday: post A\n- Tuesday: **post B**"), { heading: "Weekly plan", body: "Monday: post A Tuesday: post B" });
  // One line, or a first line too long for a heading: all body.
  assert.deepEqual(previewOf("Just one line."), { heading: null, body: "Just one line." });
  const long = `${"word ".repeat(40)}\nsecond`;
  assert.equal(previewOf(long).heading, null);
  const clipped = previewOf(`Title\n${"x".repeat(500)}`, 100);
  assert.equal(clipped.body.length, 100);
  assert.ok(clipped.body.endsWith("…"));
  assert.equal(previewOf("   \n  "), null);
  assert.equal(previewOf(null), null);
});

test("downloads are named after the result", () => {
  assert.equal(downloadName("Weekly content plan"), "weekly-content-plan.md");
  assert.equal(downloadName("Résumé: Q4 / 2026!"), "résumé-q4-2026.md");
  assert.equal(downloadName("???"), "result.md");
  assert.equal(downloadName("周报 计划"), "周报-计划.md");
  assert.ok(downloadName("a".repeat(100)).length <= 63);
});

test("a task shows its newest attempt that wrote output", () => {
  assert.equal(latestTaskResult([]), null);
  assert.equal(latestTaskResult([{ attempt: 1, result: "one" }, { attempt: 3, result: "three" }, { attempt: 2, result: "two" }]), "three");
  // Attempt 3 was stopped before it wrote anything: attempt 2's output is what exists.
  assert.equal(latestTaskResult([{ attempt: 1, result: "one" }, { attempt: 3, result: null }, { attempt: 2, result: "two" }]), "two");
  assert.equal(latestTaskResult([{ attempt: 1, result: "  " }]), null);
});

test("the selected result shows its output, else what was asked, else the question", () => {
  assert.deepEqual(taskOutput([{ attempt: 1, result: "Plan ready" }], "Write the plan"), { kind: "output", text: "Plan ready" });
  assert.deepEqual(taskOutput([], "Write the plan"), { kind: "brief", text: "Write the plan" });
  assert.deepEqual(taskOutput([{ attempt: 1, result: null }], " "), { kind: "none", text: null });
  const base = { status: "completed", result: null, brief: "Compare carriers", question: null };
  assert.deepEqual(jobOutput({ ...base, result: "Carrier A" }), { kind: "output", text: "Carrier A" });
  assert.deepEqual(jobOutput({ ...base, status: "needs_input", question: "Which month?" }), { kind: "question", text: "Which month?" });
  // A question only counts while the job still waits on it.
  assert.deepEqual(jobOutput({ ...base, question: "Which month?" }), { kind: "brief", text: "Compare carriers" });
  assert.deepEqual(jobOutput({ ...base, brief: "" }), { kind: "none", text: null });
  assert.deepEqual(rowOutput({ text: "Digest" }), { kind: "output", text: "Digest" });
  assert.deepEqual(rowOutput({ text: null }), { kind: "none", text: null });
});

test("results link to where they came from", () => {
  assert.equal(resultsHref(), "/results/");
  assert.equal(resultsHref("all"), "/results/");
  assert.equal(resultsHref("review"), "/results/?filter=review");
  assert.equal(parseFilter(new URLSearchParams(resultsHref("review").split("?")[1]).get("filter")), "review");
  assert.equal(boardTaskHref(12), "/tasks/?task=12");
  assert.equal(routineHref(4), "/routines/?id=4&tab=runs");
});

test("the agent filter lists only agents with results, by name", () => {
  const agents = [{ id: 1, name: "Verde" }, { id: 2, name: "Atlas" }, { id: 3, name: "Scout" }];
  const rows = [row("a", "2026-11-17T00:00:00Z", { agentId: 1 }), row("b", "2026-11-17T00:00:00Z", { agentId: 2 }), row("c", "2026-11-17T00:00:00Z", { agentId: null })];
  assert.deepEqual(agentsWithResults(rows, agents).map((a) => a.name), ["Atlas", "Verde"]);
});
