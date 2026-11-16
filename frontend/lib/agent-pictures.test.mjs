import assert from "node:assert/strict";
import { test } from "node:test";
import { createPictureStore, PICTURE_SIDE, squareCrop } from "./agent-pictures.ts";

// A store whose requests are answered by hand.
function harness() {
  const pending = [];
  const revoked = [];
  let clock = 1_000;
  let n = 0;
  const store = createPictureStore({
    load: (agentId) => new Promise((resolve, reject) => pending.push({ agentId, resolve, reject })),
    classify: (error) => error.kind,
    revoke: (url) => revoked.push(url),
    now: () => clock,
    retryMs: 100,
  });
  let changes = 0;
  store.subscribe(() => { changes += 1; });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    store,
    pending,
    revoked,
    settle,
    changes: () => changes,
    tick: (ms) => { clock += ms; },
    answer: async (index, url = `blob:${++n}`) => { pending[index].resolve(url); await settle(); return url; },
    fail: async (index, kind) => { pending[index].reject({ kind }); await settle(); },
  };
}

test("a picture is read once and shared", async () => {
  const h = harness();
  assert.equal(h.store.state(1), "unknown");
  h.store.ensure(1);
  h.store.ensure(1);
  assert.equal(h.pending.length, 1);
  assert.equal(h.store.state(1), "loading");
  assert.equal(h.store.url(1), null);
  const url = await h.answer(0);
  assert.equal(h.store.url(1), url);
  assert.equal(h.store.state(1), "ready");
  h.store.ensure(1);
  assert.equal(h.pending.length, 1);
  assert.ok(h.changes() >= 2);
});

test("a 404 means no picture, and is not asked again", async () => {
  const h = harness();
  h.store.ensure(2);
  await h.fail(0, "none");
  assert.equal(h.store.state(2), "none");
  assert.equal(h.store.url(2), null);
  h.tick(10_000);
  h.store.ensure(2);
  assert.equal(h.pending.length, 1);
});

test("a 403 stops every later request", async () => {
  const h = harness();
  h.store.ensure(1);
  await h.fail(0, "blocked");
  h.store.ensure(2);
  h.store.refresh(3);
  assert.equal(h.pending.length, 1);
  assert.equal(h.store.state(2), "none");
  assert.equal(h.store.isBlocked(), true);
});

test("another failure is tried again only after a while", async () => {
  const h = harness();
  h.store.ensure(1);
  await h.fail(0, "retry");
  assert.equal(h.store.state(1), "unknown");
  h.store.ensure(1);
  assert.equal(h.pending.length, 1);
  h.tick(150);
  h.store.ensure(1);
  assert.equal(h.pending.length, 2);
});

test("refresh keeps the old picture until the new one arrives, then frees it", async () => {
  const h = harness();
  h.store.ensure(1);
  const first = await h.answer(0);
  h.store.refresh(1);
  assert.equal(h.store.url(1), first);
  assert.equal(h.store.state(1), "loading");
  const second = await h.answer(1);
  assert.equal(h.store.url(1), second);
  assert.deepEqual(h.revoked, [first]);
});

test("clear shows initials at once and drops a late answer", async () => {
  const h = harness();
  h.store.ensure(1);
  const first = await h.answer(0);
  h.store.refresh(1);
  h.store.clear(1);
  assert.equal(h.store.url(1), null);
  assert.equal(h.store.state(1), "none");
  const late = await h.answer(1);
  assert.equal(h.store.url(1), null);
  assert.deepEqual(h.revoked, [first, late]);
});

test("an answer to an older request is dropped", async () => {
  const h = harness();
  h.store.ensure(1);
  h.store.refresh(1);
  const old = await h.answer(0);
  assert.equal(h.store.url(1), null);
  assert.deepEqual(h.revoked, [old]);
  const fresh = await h.answer(1);
  assert.equal(h.store.url(1), fresh);
});

test("an uploaded picture is cut to the centred square, at most PICTURE_SIDE wide", () => {
  assert.deepEqual(squareCrop(2000, 1000), { sx: 500, sy: 0, size: 1000, side: PICTURE_SIDE });
  assert.deepEqual(squareCrop(300, 401), { sx: 0, sy: 50, size: 300, side: 300 });
  assert.deepEqual(squareCrop(512, 512), { sx: 0, sy: 0, size: 512, side: 512 });
  assert.deepEqual(squareCrop(0, 10), { sx: 0, sy: 5, size: 0, side: 0 });
});
