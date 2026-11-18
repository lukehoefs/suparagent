import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeRun, approvalThread, approvalThreads, boardLanes, cardAction, cardMetaStatus, cardStatus, cardTime, columnLabelKey,
  columnTone, displayColumns, groupByColumn, inLane, isOverdueLine, laneCards, matchesFilters, moveCard, parseTaskId, taskHref,
} from './tasks-board.ts';

const column = (key, name = key) => ({ id: 1, key, name, position: 0 });
const item = (over = {}) => ({
  id: 1, board_id: 1, column_id: 1, title: 'Freight read', description: 'November numbers',
  priority: 'normal', due_date: null, due_at: null, timezone: 'UTC', agent_id: null, team_id: null,
  thread_id: null, position: 1, revision: 1, archived: false, completed_at: null,
  created_at: '2026-11-01T08:00:00Z', updated_at: '2026-11-01T08:00:00Z',
  execution_state: null, execution_thread_id: null, execution_attempt: null, ...over,
});

test('known columns are translated by key; a column the backend named itself keeps its name', () => {
  assert.equal(columnLabelKey(column('doing')), 'tasks.column.doing');
  assert.equal(columnLabelKey(column('custom')), null);
  assert.deepEqual(cardStatus(item(), column('custom', 'Blocked')), { status: 'idle', label: 'Blocked' });
});

test('column counts are tinted by status only: amber needs you, blue in progress, green done', () => {
  assert.equal(columnTone(column('waiting'), 2), 'warning');
  assert.equal(columnTone(column('review'), 1), 'warning');
  assert.equal(columnTone(column('doing'), 3), 'running');
  assert.equal(columnTone(column('done'), 5), 'success');
  assert.equal(columnTone(column('backlog'), 4), 'neutral');
  assert.equal(columnTone(column('ready'), 1), 'neutral');
});

test('an empty column count is grey, whatever the column', () => {
  for (const key of ['waiting', 'review', 'doing', 'done', 'backlog', 'custom']) {
    assert.equal(columnTone(column(key), 0), 'neutral');
  }
});

test('columns show what needs you first and Done last; other columns follow in server order', () => {
  const server = ['backlog', 'ready', 'blocked', 'doing', 'waiting', 'later', 'review', 'done']
    .map((key, index) => ({ id: index + 1, key, name: key, position: index }));
  const shown = displayColumns(server);
  assert.deepEqual(shown.map((value) => value.key), ['waiting', 'review', 'doing', 'ready', 'backlog', 'done', 'blocked', 'later']);
  // The board's own list stays as the server sent it, and each column keeps its id.
  assert.deepEqual(server.map((value) => value.key), ['backlog', 'ready', 'blocked', 'doing', 'waiting', 'later', 'review', 'done']);
  assert.equal(shown[0].id, 5);
  assert.deepEqual(displayColumns([]), []);
});

test('the board shows four lanes over the six columns; other columns follow as lanes of their own', () => {
  const server = ['backlog', 'ready', 'blocked', 'doing', 'waiting', 'review', 'done']
    .map((key, index) => ({ id: index + 1, key, name: key === 'blocked' ? 'Blocked' : key, position: index }));
  const lanes = boardLanes(server);
  assert.deepEqual(lanes.map((lane) => lane.key), ['attention', 'running', 'todo', 'done', 'column:3']);
  assert.deepEqual(lanes.map((lane) => lane.labelKey), ['tasks.lane.attention', 'tasks.lane.running', 'tasks.lane.todo', 'tasks.lane.done', null]);
  // Waiting for you lists waiting then review; To do lists ready then backlog.
  assert.deepEqual(lanes[0].columns.map((value) => value.key), ['waiting', 'review']);
  assert.deepEqual(lanes[2].columns.map((value) => value.key), ['ready', 'backlog']);
  // A drop files the card into the lane's first column: waiting, doing, backlog, done.
  assert.deepEqual(lanes.map((lane) => lane.target.key), ['waiting', 'doing', 'backlog', 'done', 'blocked']);
  assert.equal(lanes[4].name, 'Blocked');
  // The board's own list stays as the server sent it.
  assert.deepEqual(server.map((value) => value.key), ['backlog', 'ready', 'blocked', 'doing', 'waiting', 'review', 'done']);
  assert.deepEqual(boardLanes([]), []);
});

test('a lane without its drop column files cards in the first column it has; an absent lane is left out', () => {
  const lanes = boardLanes([{ id: 7, key: 'review', name: 'review' }, { id: 8, key: 'done', name: 'done' }]);
  assert.deepEqual(lanes.map((lane) => lane.key), ['attention', 'done']);
  assert.equal(lanes[0].target.id, 7);
});

test('a lane lists each of its columns’ cards in turn; a card is in its lane by column', () => {
  const [attention] = boardLanes([{ id: 1, key: 'waiting', name: 'waiting' }, { id: 2, key: 'review', name: 'review' }]);
  const groups = new Map([[1, ['a', 'b']], [2, ['c']]]);
  assert.deepEqual(laneCards(attention, groups), ['a', 'b', 'c']);
  assert.deepEqual(laneCards(attention, new Map()), []);
  assert.equal(inLane(attention, 2), true);
  assert.equal(inLane(attention, 3), false);
});

test('a lane count is tinted by its drop column: amber needs you, blue running, grey to do, green done', () => {
  const tones = boardLanes(['backlog', 'ready', 'doing', 'waiting', 'review', 'done'].map((key, index) => ({ id: index + 1, key, name: key })))
    .map((lane) => columnTone(lane.target, 1));
  assert.deepEqual(tones, ['warning', 'running', 'neutral', 'success']);
});

test('approvals waiting for you come from the needs-you rows, by conversation', () => {
  const waiting = approvalThreads([
    { kind: 'approval', thread_id: 9 }, { kind: 'question', thread_id: 4 }, { kind: 'approval', thread_id: null },
  ]);
  assert.deepEqual([...waiting], [9]);
  assert.deepEqual([...approvalThreads(null)], []);
  assert.equal(approvalThread(item({ thread_id: 9 }), column('waiting'), waiting), 9);
  assert.equal(approvalThread(item({ execution_thread_id: 9, thread_id: 4 }), column('backlog'), waiting), 9);
  assert.equal(approvalThread(item({ thread_id: 4 }), column('waiting'), waiting), null);
  // Not for a card that is done or archived.
  assert.equal(approvalThread(item({ thread_id: 9 }), column('done'), waiting), null);
  assert.equal(approvalThread(item({ thread_id: 9, archived: true }), column('waiting'), waiting), null);
});

test('a waiting approval reads Needs your approval rather than the bare column word', () => {
  assert.deepEqual(cardStatus(item(), column('waiting'), true), { status: 'waiting', key: 'tasks.state.needsApproval' });
  assert.deepEqual(cardStatus(item(), column('waiting')), { status: 'waiting', key: 'tasks.state.waiting' });
  // A live attempt still says more.
  assert.deepEqual(cardStatus(item({ execution_state: 'running' }), column('doing'), true), { status: 'running', key: 'tasks.state.working' });
});

test('the meta line shows a state only when it says more than the lane heading', () => {
  assert.equal(cardMetaStatus(item(), column('waiting')), null);
  assert.equal(cardMetaStatus(item(), column('doing')), null);
  assert.equal(cardMetaStatus(item(), column('backlog')), null);
  assert.equal(cardMetaStatus(item(), column('done')), null);
  assert.equal(cardMetaStatus(item({ execution_state: 'completed' }), column('done')), null);
  assert.equal(cardMetaStatus(item(), column('custom', 'Blocked')), null);
  assert.deepEqual(cardMetaStatus(item(), column('review')), { status: 'waiting', key: 'tasks.state.review' });
  assert.deepEqual(cardMetaStatus(item(), column('ready')), { status: 'idle', key: 'tasks.state.ready' });
  assert.deepEqual(cardMetaStatus(item(), column('waiting'), true), { status: 'waiting', key: 'tasks.state.needsApproval' });
  assert.deepEqual(cardMetaStatus(item({ execution_state: 'running' }), column('doing')), { status: 'running', key: 'tasks.state.working' });
  assert.deepEqual(cardMetaStatus(item({ execution_state: 'failed' }), column('backlog')), { status: 'denied', key: 'tasks.state.failed' });
});

test('an agent attempt says more than the column while it is live', () => {
  assert.deepEqual(cardStatus(item({ execution_state: 'needs_input' }), column('backlog')), { status: 'waiting', key: 'tasks.state.needsApproval' });
  assert.deepEqual(cardStatus(item({ execution_state: 'running' }), column('ready')), { status: 'running', key: 'tasks.state.working' });
  assert.deepEqual(cardStatus(item({ execution_state: 'claimed' }), column('ready')), { status: 'running', key: 'tasks.state.working' });
  assert.deepEqual(cardStatus(item({ execution_state: 'queued' }), column('ready')), { status: 'idle', key: 'tasks.state.queued' });
  assert.deepEqual(cardStatus(item({ execution_state: 'failed' }), column('doing')), { status: 'denied', key: 'tasks.state.failed' });
  assert.deepEqual(cardStatus(item({ execution_state: 'interrupted' }), column('doing')), { status: 'denied', key: 'tasks.state.interrupted' });
});

test('finished work waits for review until the card is moved to Done', () => {
  assert.deepEqual(cardStatus(item({ execution_state: 'completed' }), column('doing')), { status: 'waiting', key: 'tasks.state.readyForReview' });
  assert.deepEqual(cardStatus(item({ execution_state: 'completed' }), column('done')), { status: 'done', key: 'tasks.state.done' });
});

test('a stopped attempt leaves the column state', () => {
  assert.deepEqual(cardStatus(item({ execution_state: 'cancelled' }), column('backlog')), { status: 'idle', key: 'tasks.state.toDo' });
  assert.deepEqual(cardStatus(item(), column('review')), { status: 'waiting', key: 'tasks.state.review' });
  assert.deepEqual(cardStatus(item(), column('doing')), { status: 'running', key: 'tasks.state.inProgress' });
  assert.deepEqual(cardStatus(item(), column('done')), { status: 'done', key: 'tasks.state.done' });
});

test('each card offers at most one action, backed by its attempt or its conversation', () => {
  assert.deepEqual(cardAction(item({ execution_state: 'needs_input', execution_thread_id: 9 }), column('doing')), { kind: 'review', threadId: 9 });
  assert.deepEqual(cardAction(item({ execution_state: 'needs_input' }), column('doing')), { kind: 'history' });
  assert.deepEqual(cardAction(item({ execution_state: 'running', execution_thread_id: 9 }), column('doing')), { kind: 'stop' });
  assert.deepEqual(cardAction(item({ execution_state: 'scheduled' }), column('ready')), { kind: 'cancel' });
  assert.deepEqual(cardAction(item({ execution_state: 'completed', execution_thread_id: 9 }), column('doing')), { kind: 'review', threadId: 9 });
  assert.deepEqual(cardAction(item({ execution_state: 'completed', execution_thread_id: 9 }), column('done')), { kind: 'open', threadId: 9 });
  assert.deepEqual(cardAction(item({ thread_id: 4 }), column('done')), { kind: 'open', threadId: 4 });
  assert.equal(cardAction(item(), column('done')), null);
  assert.equal(cardAction(item({ thread_id: 4 }), column('backlog')), null);
  assert.equal(cardAction(item({ execution_state: 'running', archived: true }), column('doing')), null);
});

test('a card waiting for you offers Review: its conversation, else its run and history', () => {
  assert.deepEqual(cardAction(item({ thread_id: 4 }), column('waiting')), { kind: 'review', threadId: 4 });
  assert.deepEqual(cardAction(item({ thread_id: 4, execution_thread_id: 9, execution_state: 'cancelled' }), column('review')), { kind: 'review', threadId: 9 });
  assert.deepEqual(cardAction(item(), column('review')), { kind: 'history' });
  assert.deepEqual(cardAction(item(), column('waiting')), { kind: 'history' });
  assert.equal(cardAction(item({ thread_id: 4, archived: true }), column('waiting')), null);
  // A waiting approval in its conversation offers Review wherever the card sits, except Done.
  assert.deepEqual(cardAction(item({ thread_id: 4 }), column('backlog'), 4), { kind: 'review', threadId: 4 });
  assert.deepEqual(cardAction(item({ thread_id: 4 }), column('done'), 4), { kind: 'open', threadId: 4 });
  // Stop still comes first while the agent works.
  assert.deepEqual(cardAction(item({ execution_state: 'running', thread_id: 4 }), column('waiting'), 4), { kind: 'stop' });
});

test('the active attempt is the newest one still scheduled, queued or running', () => {
  const runs = [
    { id: 3, attempt: 3, state: 'failed' },
    { id: 2, attempt: 2, state: 'running' },
    { id: 1, attempt: 1, state: 'cancelled' },
  ];
  assert.equal(activeRun(runs).id, 2);
  assert.equal(activeRun([{ id: 1, attempt: 1, state: 'completed' }]), null);
});

test('the time line shows the deadline, then the finish, then the last change', () => {
  const now = new Date(2026, 10, 17, 10, 0).getTime();
  assert.equal(cardTime(item({ due_date: '2026-11-17' }), now).key, 'tasks.time.dueToday');
  assert.equal(cardTime(item({ due_date: '2026-11-18' }), now).key, 'tasks.time.dueTomorrow');
  assert.equal(cardTime(item({ due_date: '2026-11-25' }), now).key, 'tasks.time.dueOn');
  assert.equal(cardTime(item({ due_date: '2026-11-16' }), now).key, 'tasks.time.overdue');
  assert.equal(cardTime(item({ due_at: new Date(2026, 10, 17, 14, 0).toISOString() }), now).key, 'tasks.time.dueTodayAt');
  assert.equal(cardTime(item({ due_at: new Date(2026, 10, 17, 9, 0).toISOString() }), now).key, 'tasks.time.overdue');
  assert.equal(cardTime(item({ due_date: '2026-11-16', completed_at: new Date(2026, 10, 17, 7, 35).toISOString() }), now).key, 'tasks.time.finishedAt');
  assert.equal(cardTime(item({ completed_at: new Date(2026, 10, 12, 7, 35).toISOString() }), now).key, 'tasks.time.finishedOn');
  const updated = cardTime(item({ updated_at: new Date(2026, 10, 17, 9, 55).toISOString() }), now);
  assert.equal(updated.key, 'tasks.time.updated');
  assert.deepEqual(updated.when, { key: 'time.minutes', n: 5 });
  assert.equal(cardTime(item({ updated_at: new Date(2026, 9, 1).toISOString() }), now).key, 'tasks.time.updatedOn');
  assert.equal(cardTime(item({ updated_at: 'not a date' }), now), null);
});

test('times are 24-hour, as Today shows them', () => {
  const now = new Date(2026, 10, 17, 20, 0).getTime();
  const finished = cardTime(item({ completed_at: new Date(2026, 10, 17, 19, 35).toISOString() }), now);
  assert.equal(finished.key, 'tasks.time.finishedAt');
  assert.match(String(finished.params.time), /^19.35$/);
  const due = cardTime(item({ due_at: new Date(2026, 10, 17, 21, 5).toISOString() }), now);
  assert.match(String(due.params.time), /^21.05$/);
});

test('an archived card is never shown as overdue', () => {
  const now = new Date(2026, 10, 17, 10, 0).getTime();
  const line = cardTime(item({ due_date: '2026-11-10', archived: true }), now);
  assert.equal(line.key, 'tasks.time.dueOn');
  assert.equal(isOverdueLine(line), false);
  assert.equal(isOverdueLine(cardTime(item({ due_date: '2026-11-10' }), now)), true);
});

test('search reads the title and description; the assignee filter uses the editor values', () => {
  const card = item({ agent_id: 7 });
  assert.equal(matchesFilters(card, '  NOVEMBER ', ''), true);
  assert.equal(matchesFilters(card, 'payroll', ''), false);
  assert.equal(matchesFilters(card, '', 'agent:7'), true);
  assert.equal(matchesFilters(card, '', 'agent:8'), false);
  assert.equal(matchesFilters(card, '', 'unassigned'), false);
  assert.equal(matchesFilters(item(), '', 'unassigned'), true);
  assert.equal(matchesFilters(item({ team_id: 2 }), '', 'team:2'), true);
  assert.equal(matchesFilters(item({ team_id: 2 }), '', 'unassigned'), false);
});

test('cards group by column in board order and unknown columns are left out', () => {
  const groups = groupByColumn([{ id: 1 }, { id: 2 }], [
    item({ id: 3, column_id: 1, position: 2 }),
    item({ id: 1, column_id: 1, position: 2 }),
    item({ id: 2, column_id: 1, position: 1 }),
    item({ id: 4, column_id: 9, position: 1 }),
  ]);
  assert.deepEqual(groups.get(1).map((card) => card.id), [2, 1, 3]);
  assert.deepEqual(groups.get(2), []);
  assert.equal(groups.has(9), false);
});

test('a moved card goes to the end of its new column, like the backend files it', () => {
  const items = [item({ id: 1, column_id: 1, position: 1 }), item({ id: 2, column_id: 2, position: 4 }), item({ id: 3, column_id: 2, position: 7 })];
  const moved = moveCard(items, 1, 2);
  assert.deepEqual(moved.find((card) => card.id === 1), { ...items[0], column_id: 2, position: 8 });
  assert.equal(moveCard(items, 2, 2), items);
  assert.equal(moveCard(items, 99, 1), items);
  assert.equal(moveCard(items, 2, 3).find((card) => card.id === 2).position, 1);
});

test('?task= takes a positive whole number only', () => {
  assert.equal(parseTaskId('42'), 42);
  assert.equal(parseTaskId('0'), null);
  assert.equal(parseTaskId('-1'), null);
  assert.equal(parseTaskId('4.2'), null);
  assert.equal(parseTaskId(null), null);
  assert.equal(taskHref(42), '/tasks/?task=42');
});
