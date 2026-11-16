import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalEffect, approvalShortcut, chatState, decidedPill, isReadOnly, isTypingTarget } from "./chat-state.ts";

test("waiting outranks working, idle otherwise", () => {
  assert.equal(chatState({ running: true, waiting: true }), "waiting");
  assert.equal(chatState({ running: true, waiting: false }), "working");
  assert.equal(chatState({ running: false, waiting: false }), "idle");
  assert.equal(chatState({ running: false, waiting: true }), "waiting");
});

test("approval effects come from the adapter's kind; unknown kinds are not guessed", () => {
  assert.equal(approvalEffect("file_read"), "read");
  assert.equal(approvalEffect("command"), "command");
  assert.equal(approvalEffect("file_write"), "write");
  assert.equal(approvalEffect("screen_input"), "screen_input");
  assert.equal(approvalEffect("screen_read"), "screen_read");
  assert.equal(approvalEffect("other"), "other");
  assert.equal(approvalEffect(undefined), "other");
  assert.equal(isReadOnly("read"), true);
  assert.equal(isReadOnly("command"), false);
  assert.equal(isReadOnly("other"), false);
});

test("decided pills", () => {
  assert.deepEqual(decidedPill("allowed", ""), { tone: "done", key: "approval.pill.allowedOnce" });
  assert.deepEqual(decidedPill("allowed", "saved_rule"), { tone: "done", key: "approval.pill.byRule" });
  assert.deepEqual(decidedPill("allowed", "accept_edits"), { tone: "done", key: "approval.pill.auto" });
  assert.deepEqual(decidedPill("denied", ""), { tone: "denied", key: "approval.denied" });
  assert.deepEqual(decidedPill("denied", "plan_mode"), { tone: "denied", key: "approval.planRefused" });
  assert.equal(decidedPill("expired", "").key, "approval.pill.expired");
  assert.equal(decidedPill("cancelled", "").key, "approval.pill.cancelled");
});

test("A allows and D denies, but never while typing, with a modifier, held down or in a dialog", () => {
  const page = { tagName: "BODY", closest: () => null };
  assert.equal(approvalShortcut({ key: "a", target: page }), "allow");
  assert.equal(approvalShortcut({ key: "D", shiftKey: true, target: page }), null); // Shift+D
  assert.equal(approvalShortcut({ key: "D", target: page }), "deny"); // Caps Lock
  assert.equal(approvalShortcut({ key: "d", target: page }), "deny");
  assert.equal(approvalShortcut({ key: "a", target: { tagName: "TEXTAREA" } }), null);
  assert.equal(approvalShortcut({ key: "a", target: { tagName: "DIV", isContentEditable: true } }), null);
  assert.equal(approvalShortcut({ key: "a", ctrlKey: true, target: page }), null);
  assert.equal(approvalShortcut({ key: "a", repeat: true, target: page }), null);
  assert.equal(approvalShortcut({ key: "a", target: { tagName: "BUTTON", closest: () => ({}) } }), null);
  assert.equal(approvalShortcut({ key: "x", target: page }), null);
  assert.equal(isTypingTarget(null), false);
});
