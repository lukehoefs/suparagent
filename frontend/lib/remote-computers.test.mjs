import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { API_BASE, ApiError, setCsrfToken } from './api.ts';
import {
  agentChoices,
  checkRemoteComputer,
  computerForAgent,
  connectionChoices,
  connectionHost,
  connectionNeedsKey,
  connectionStateKey,
  createRemoteComputer,
  deleteRemoteComputer,
  fetchRemoteComputerScreenshot,
  freeComputers,
  handBack,
  isLinkConflict,
  listRemoteComputers,
  pictureKey,
  remoteComputersUnsupported,
  remoteComputerScreenshotUrl,
  remoteComputerStatus,
  remoteComputerViewerUrl,
  remoteStateKey,
  replaceComputer,
  screenshotFilename,
  takeControl,
  updateRemoteComputer,
  viewerMode,
  viewerTicket,
} from './remote-computers.ts';
import { computersMessages } from './locales/computers-extra.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setCsrfToken(null); });

function computer(overrides = {}) {
  return {
    id: 1, name: 'Atlas computer', mcp_connection_id: 'c1', connection_name: 'Atlas gateway',
    agent_id: null, agent_name: null, base_url: 'https://atlas.example.com', state: 'online',
    human_control: false, control_started_at: null, live_view: true, last_checked_at: null, last_error: null,
    ...overrides,
  };
}

function record(status = 200, body = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('every call uses the contract path, method and body, with the session and CSRF token', async () => {
  setCsrfToken('csrf');
  const calls = record(200, computer());
  await listRemoteComputers();
  await createRemoteComputer({ name: 'Atlas', mcp_connection_id: 'c1', agent_id: 3 });
  await updateRemoteComputer(1, { agent_id: null });
  await checkRemoteComputer(1);
  await takeControl(1);
  await handBack(1);
  await viewerTicket(1, 'view');
  const shape = calls.map(({ url, init }) => [init.method ?? 'GET', new URL(url).pathname, init.body ?? null]);
  assert.deepEqual(shape, [
    ['GET', '/api/v1/remote-computers', null],
    ['POST', '/api/v1/remote-computers', JSON.stringify({ name: 'Atlas', mcp_connection_id: 'c1', agent_id: 3 })],
    ['PATCH', '/api/v1/remote-computers/1', JSON.stringify({ agent_id: null })],
    ['POST', '/api/v1/remote-computers/1/check', null],
    ['POST', '/api/v1/remote-computers/1/take-control', null],
    ['POST', '/api/v1/remote-computers/1/hand-back', null],
    ['POST', '/api/v1/remote-computers/1/viewer-ticket', JSON.stringify({ mode: 'view' })],
  ]);
  for (const { init } of calls) assert.equal(init.credentials, 'include');
  for (const { init } of calls.slice(1)) assert.equal(init.headers['X-CSRF-Token'], 'csrf');
});

test('unlinking sends agent_id null; a rename leaves the agent out', async () => {
  const calls = record(200, computer());
  await updateRemoteComputer(4, { name: 'Renamed' });
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Renamed' });
});

test('delete answers 204 with nothing to read', async () => {
  const calls = record(204);
  assert.equal(await deleteRemoteComputer(9), undefined);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/remote-computers/9');
});

test('the screenshot address busts the cache; a refusal keeps its error code', async () => {
  assert.equal(new URL(remoteComputerScreenshotUrl(2, 1234)).pathname, '/api/v1/remote-computers/2/screenshot');
  assert.equal(new URL(remoteComputerScreenshotUrl(2, 1234)).searchParams.get('t'), '1234');
  globalThis.fetch = async (url, init) => {
    assert.equal(init.credentials, 'include');
    return new Response(JSON.stringify({ detail: { error_code: 'computer_offline', message: 'Offline' } }), { status: 409 });
  };
  await assert.rejects(fetchRemoteComputerScreenshot(2, 1), (err) => err instanceof ApiError && err.status === 409 && err.code === 'computer_offline');
  globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  const blob = await fetchRemoteComputerScreenshot(2, 2);
  assert.equal(blob.size, 4);
});

test('the viewer socket is the API address on ws or wss, with the ticket', () => {
  const url = new URL(remoteComputerViewerUrl(5, 'abc', 'https://agent.example.com/computers/'));
  // API_BASE is http://localhost:8000/api/v1 here; a relative API_BASE would follow the page.
  assert.equal(url.protocol, new URL(API_BASE, 'https://agent.example.com/').protocol === 'https:' ? 'wss:' : 'ws:');
  assert.equal(url.pathname, '/api/v1/remote-computers/5/viewer');
  assert.equal(url.searchParams.get('ticket'), 'abc');
  assert.equal(new URL(remoteComputerViewerUrl(5, 'a&b', 'http://localhost:3000/')).searchParams.get('ticket'), 'a&b');
});

test('status words and colours: online green, offline red, needs key amber, off grey', () => {
  assert.equal(remoteComputerStatus('online'), 'done');
  assert.equal(remoteComputerStatus('offline'), 'denied');
  assert.equal(remoteComputerStatus('needs_key'), 'waiting');
  assert.equal(remoteComputerStatus('disabled'), 'idle');
  const en = computersMessages.en;
  for (const state of ['online', 'offline', 'needs_key', 'disabled']) {
    assert.ok(remoteStateKey(state) in en, state);
    assert.ok(pictureKey(state) in en, state);
  }
  assert.equal(en[remoteStateKey('needs_key')], 'Needs key');
  assert.equal(en[remoteStateKey('disabled')], 'Off');
  // An unknown state from a newer backend still has words.
  assert.ok(remoteStateKey('rebooting') in en);
});

test('the live view mode follows human_control', () => {
  assert.equal(viewerMode({ human_control: false }), 'view');
  assert.equal(viewerMode({ human_control: true }), 'control');
});

test('the agent finds its computer; free computers are the unlinked ones, by name', () => {
  const list = [computer({ id: 1, name: 'B', agent_id: 7 }), computer({ id: 2, name: 'C' }), computer({ id: 3, name: 'A' })];
  assert.equal(computerForAgent(list, 7)?.id, 1);
  assert.equal(computerForAgent(list, 8), null);
  assert.equal(computerForAgent(null, 7), null);
  assert.deepEqual(freeComputers(list).map((item) => item.id), [3, 2]);
  const next = replaceComputer(list, computer({ id: 2, name: 'C', agent_id: 9 }));
  assert.equal(next[1].agent_id, 9);
  assert.equal(list[1].agent_id, null);
});

test('agent choices: live agents only, and one already linked elsewhere is taken', () => {
  const agents = [
    { id: 1, name: 'Hoefs', archived_at: null },
    { id: 2, name: 'Atlas', archived_at: null },
    { id: 3, name: 'Old', archived_at: '2026-01-01T00:00:00Z' },
  ];
  const computers = [computer({ id: 10, agent_id: 1 }), computer({ id: 11, agent_id: null })];
  assert.deepEqual(agentChoices(agents, computers), [
    { id: 2, name: 'Atlas', taken: false },
    { id: 1, name: 'Hoefs', taken: true },
  ]);
  // Editing computer 10 itself: its own agent is not taken.
  assert.equal(agentChoices(agents, computers, 10).find((choice) => choice.id === 1).taken, false);
  assert.deepEqual(agentChoices(null, computers), []);
});

test('connection choices: one computer per connection, and their state in words', () => {
  const connections = [
    { id: 'b', name: 'Scout', endpoint: 'https://scout.example.com/mcp', auth_mode: 'bearer', enabled: true, state: 'connected', credential_configured: true },
    { id: 'a', name: 'Atlas', endpoint: 'https://atlas.example.com/mcp', auth_mode: 'bearer', enabled: false, state: 'not_tested', credential_configured: false },
  ];
  const choices = connectionChoices(connections, [computer({ mcp_connection_id: 'b' })]);
  assert.deepEqual(choices.map(({ connection, taken }) => [connection.id, taken]), [['a', false], ['b', true]]);
  assert.equal(connectionStateKey({ enabled: true, state: 'connected' }), 'computers.server.on');
  assert.equal(connectionStateKey({ enabled: false, state: 'connected' }), 'computers.server.off');
  assert.equal(connectionStateKey({ enabled: false, state: 'disabled' }), 'computers.server.off');
  assert.equal(connectionStateKey({ enabled: false, state: 'not_tested' }), 'computers.server.notTested');
  assert.equal(connectionStateKey({ enabled: true, state: 'unreachable' }), 'computers.server.unreachable');
  assert.equal(connectionStateKey({ enabled: true, state: 'needs_sign_in' }), 'computers.server.needsSignIn');
  assert.equal(connectionNeedsKey(connections[1]), true);
  assert.equal(connectionNeedsKey({ auth_mode: 'none', credential_configured: false }), false);
  assert.equal(connectionHost('https://atlas.example.com/mcp'), 'atlas.example.com');
  assert.equal(connectionHost('not a url'), 'not a url');
});

test('picture file names are plain, dated and never empty', () => {
  const at = new Date(2026, 10, 17, 9, 5);
  assert.equal(screenshotFilename('Atlas computer', at), 'atlas-computer-2026-11-17-0905.png');
  assert.equal(screenshotFilename('  Café / Ölü  ', at), 'cafe-olu-2026-11-17-0905.png');
  assert.equal(screenshotFilename('中文', at), 'computer-2026-11-17-0905.png');
});

test('conflicts and older backends are told apart by status', () => {
  assert.equal(isLinkConflict(new ApiError(409, 'taken')), true);
  assert.equal(isLinkConflict(new ApiError(400, 'bad')), false);
  assert.equal(isLinkConflict(null), false);
  assert.equal(remoteComputersUnsupported(new ApiError(404, 'Not Found')), true);
  assert.equal(remoteComputersUnsupported(new ApiError(500, 'boom')), false);
});

test('every computers message exists in all 13 locales with the same placeholders, and none is bracketed', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
  const { en, ...others } = computersMessages;
  assert.equal(Object.keys(others).length, 12);
  for (const [locale, table] of Object.entries(others)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(en).sort(), locale);
    for (const [key, text] of Object.entries(table)) {
      assert.equal(placeholders(text), placeholders(en[key]), `${locale} ${key}`);
      assert.ok(text.trim(), `${locale} ${key}`);
    }
  }
  for (const text of Object.values(en)) assert.doesNotMatch(text, /\[[A-Z_]+\]/);
});

test('a refused call keeps its error code', async () => {
  record(409, { detail: { error_code: 'agent_already_linked' } });
  await assert.rejects(
    createRemoteComputer({ name: 'x', mcp_connection_id: 'c' }),
    (err) => err instanceof ApiError && err.code === 'agent_already_linked' && err.status === 409,
  );
});
