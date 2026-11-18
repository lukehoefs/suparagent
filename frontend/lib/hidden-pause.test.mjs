import assert from "node:assert/strict";
import { test } from "node:test";
import { pauseWhileHidden } from "./hidden-pause.ts";

function fakeDocument(hidden = false) {
  const listeners = new Set();
  return {
    hidden,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    set(value) {
      this.hidden = value;
      for (const listener of [...listeners]) listener();
    },
    get listening() {
      return listeners.size;
    },
  };
}

function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    set: (run, ms) => {
      const id = next++;
      pending.set(id, { run, ms });
      return id;
    },
    clear: (id) => pending.delete(id),
    fire() {
      for (const [id, { run }] of [...pending]) {
        pending.delete(id);
        run();
      }
    },
    get count() {
      return pending.size;
    },
  };
}

test("a tab hidden past the grace period pauses, and resumes when it shows again", () => {
  const doc = fakeDocument();
  const timers = fakeTimers();
  const seen = [];
  const stop = pauseWhileHidden(doc, 10_000, () => seen.push("pause"), () => seen.push("resume"), timers);
  doc.set(true);
  assert.equal(timers.count, 1);
  timers.fire();
  assert.deepEqual(seen, ["pause"]);
  doc.set(false);
  assert.deepEqual(seen, ["pause", "resume"]);
  stop();
  assert.equal(doc.listening, 0);
});

test("a quick switch away and back changes nothing", () => {
  const doc = fakeDocument();
  const timers = fakeTimers();
  const seen = [];
  pauseWhileHidden(doc, 10_000, () => seen.push("pause"), () => seen.push("resume"), timers);
  doc.set(true);
  doc.set(false);
  assert.equal(timers.count, 0);
  timers.fire();
  assert.deepEqual(seen, []);
});

test("a page hidden from the start waits the grace period too, and cleanup stops the wait", () => {
  const doc = fakeDocument(true);
  const timers = fakeTimers();
  const seen = [];
  const stop = pauseWhileHidden(doc, 10_000, () => seen.push("pause"), () => seen.push("resume"), timers);
  assert.equal(timers.count, 1);
  stop();
  assert.equal(timers.count, 0);
  assert.deepEqual(seen, []);
});
