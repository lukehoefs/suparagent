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
  connectionUsable,
  createChangeClock,
  createRemoteComputer,
  deleteRemoteComputer,
  fetchRemoteComputerScreenshot,
  freeComputers,
  handBack,
  isLinkConflict,
  lastErrorKey,
  listRemoteComputers,
  pictureKey,
  remoteComputersUnsupported,
  remoteComputerScreenshotUrl,
  remoteComputerStatus,
  remoteComputerViewerUrl,
  remoteErrorKey,
  remoteFailureKey,
  remoteStateKey,
  replaceComputer,
  screenshotFilename,
  takeControl,
  turnOnComputer,
  turnOnStep,
  updateRemoteComputer,
  viewerCloseKey,
  viewerEnded,
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

test('status words and colours: online green, offline red, needs key amber, stopped red', () => {
  assert.equal(remoteComputerStatus('online'), 'done');
  assert.equal(remoteComputerStatus('offline'), 'denied');
  assert.equal(remoteComputerStatus('needs_key'), 'waiting');
  assert.equal(remoteComputerStatus('disabled'), 'denied');
  const en = computersMessages.en;
  for (const state of ['online', 'offline', 'needs_key', 'disabled']) {
    assert.ok(remoteStateKey(state) in en, state);
    assert.ok(pictureKey(state) in en, state);
  }
  assert.equal(en[remoteStateKey('needs_key')], 'Needs key');
  assert.equal(en[remoteStateKey('disabled')], 'Stopped');
  // The two red states keep different words.
  assert.notEqual(en[remoteStateKey('disabled')], en[remoteStateKey('offline')]);
  // An unknown state from a newer backend still has words.
  assert.ok(remoteStateKey('rebooting') in en);
});

test('the live view mode follows human_control', () => {
  assert.equal(viewerMode({ human_control: false }), 'view');
  assert.equal(viewerMode({ human_control: true }), 'control');
});

test('a hand-back (4410) or lost control (4409) ends the stream instead of retrying it', () => {
  // Hand-back closes control streams with 4410; the 5 s re-check closes them with 4409.
  assert.equal(viewerEnded('control', 4410), true);
  assert.equal(viewerEnded('control', 4409), true);
  // Unlinking closes every stream with 4410.
  assert.equal(viewerEnded('view', 4410), true);
  // A watch-only stream is never "control ended"; other drops are retried as before.
  assert.equal(viewerEnded('view', 4409), false);
  assert.equal(viewerEnded('control', 1006), false);
  assert.equal(viewerEnded('view', 4502), false);
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

test('why a check failed is said in words, never as the raw backend code', () => {
  const en = computersMessages.en;
  for (const code of ['timeout', 'unreachable', 'unsafe_address', 'bad_status']) {
    const key = lastErrorKey(code);
    assert.ok(key && key in en, code);
    assert.notEqual(en[key], code);
  }
  assert.equal(lastErrorKey(null), null);
  assert.equal(lastErrorKey(undefined), null);
  // A reason a newer backend adds shows nothing rather than its code.
  assert.equal(lastErrorKey('rebooting'), null);
});

test('every error code the routes answer with has its own words, never the HTTP status text', () => {
  const codes = ['remote_computer_not_found', 'connection_not_found', 'agent_not_found', 'connection_already_linked',
    'agent_already_linked', 'computer_offline', 'computer_needs_key', 'computer_disabled', 'control_not_taken',
    'bearer_required', 'unsafe_endpoint', 'invalid_name', 'too_many_viewers', 'key_rejected', 'screenshot_failed',
    'screenshot_not_offered'];
  const keys = codes.map(remoteErrorKey);
  assert.ok(keys.every((key) => typeof key === 'string' && key.startsWith('computers.error.')));
  assert.equal(new Set(keys).size, codes.length);
  assert.equal(remoteErrorKey('something_newer'), null);
  assert.equal(remoteErrorKey(undefined), null);
  // 422 bearer_required over HTTP/1.1 arrives as "Unprocessable Entity": the code wins.
  assert.equal(remoteFailureKey(new ApiError(422, 'Unprocessable Entity', 'bearer_required')), 'computers.error.bearerRequired');
  assert.equal(remoteFailureKey(new ApiError(409, 'Conflict', 'computer_offline')), 'computers.error.offline');
  assert.equal(remoteFailureKey(new ApiError(409, 'Conflict')), 'computers.error.conflict');
  assert.equal(remoteFailureKey(new ApiError(502, 'Bad Gateway')), 'computers.error.generic');
  assert.equal(remoteFailureKey(new Error('network'), 'computers.loadFailed'), 'computers.loadFailed');
});

test('a refused or ended live view says why when its close code does', () => {
  assert.equal(viewerCloseKey(4429), 'computers.error.tooManyViewers');
  assert.equal(viewerCloseKey(4502), 'computers.error.streamFailed');
  assert.equal(viewerCloseKey(4403), null);
  assert.equal(viewerCloseKey(1006), null);
});

test('only a bearer connection can be a computer, and the rest say so', () => {
  const connections = [
    { id: 'o', name: 'One', endpoint: 'https://one.example.com/mcp', auth_mode: 'oauth', enabled: true, state: 'connected', credential_configured: true },
    { id: 'b', name: 'Bytebot', endpoint: 'https://bot.example.com/mcp', auth_mode: 'bearer', enabled: true, state: 'connected', credential_configured: true },
  ];
  assert.deepEqual(connectionChoices(connections, []).map(({ connection, usable }) => [connection.id, usable]), [['b', true], ['o', false]]);
  assert.equal(connectionUsable({ auth_mode: 'header' }), false);
  assert.equal(connectionUsable({ auth_mode: 'none' }), false);
});

test('a list read that overlaps a change made here is dropped', async () => {
  const clock = createChangeClock();
  const before = clock.stamp();
  assert.equal(clock.current(before), true);
  let finish;
  const change = clock.change(() => new Promise((resolve) => { finish = resolve; }));
  const during = clock.stamp();
  assert.equal(clock.current(before), false); // started before the change
  assert.equal(clock.current(during), false); // the change is still on its way
  finish('taken');
  assert.equal(await change, 'taken');
  assert.equal(clock.current(during), false); // may carry the state from before it
  const after = clock.stamp();
  assert.equal(clock.current(after), true);
  clock.mark(); // a dialog saved something
  assert.equal(clock.current(after), false);
  await assert.rejects(clock.change(() => Promise.reject(new Error('refused'))));
  assert.equal(clock.current(clock.stamp()), true); // a failed change is over too
});

test('Turn on switches on a tested server that is off; anything else is said, not tried', () => {
  assert.equal(turnOnStep({ enabled: false, state: 'disabled', can_manage: true }), 'enable');
  assert.equal(turnOnStep({ enabled: true, state: 'connected', can_manage: true }), 'on');
  // Switched on elsewhere: only a fresh check, also for a server someone else added.
  assert.equal(turnOnStep({ enabled: true, state: 'connected', can_manage: false }), 'on');
  for (const state of ['not_tested', 'unreachable', 'needs_sign_in']) {
    assert.equal(turnOnStep({ enabled: false, state, can_manage: true }), 'test', state);
  }
  assert.equal(turnOnStep({ enabled: false, state: 'disabled', can_manage: false }), 'not_yours');
  assert.equal(turnOnStep(undefined), 'missing');
  assert.equal(turnOnStep(null), 'missing');
});

function routes(table) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push([init.method ?? 'GET', path, init.body ?? null]);
    const body = table[`${init.method ?? 'GET'} ${path}`];
    return new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 404 : 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('Turn on uses the Apps enable call at the current revision, then checks the computer again', async () => {
  const server = { id: 'c1', enabled: false, state: 'disabled', can_manage: true, revision: 7 };
  const calls = routes({
    'GET /api/v1/integrations/custom-mcp/connections': [{ ...server, id: 'other' }, server],
    'POST /api/v1/integrations/custom-mcp/connections/c1/enable': { ...server, enabled: true, state: 'connected', revision: 8 },
    'POST /api/v1/remote-computers/1/check': computer({ state: 'online' }),
  });
  const next = await turnOnComputer(computer({ state: 'disabled', live_view: false }));
  assert.equal(next.state, 'online');
  assert.deepEqual(calls, [
    ['GET', '/api/v1/integrations/custom-mcp/connections', null],
    ['POST', '/api/v1/integrations/custom-mcp/connections/c1/enable', JSON.stringify({ revision: 7 })],
    ['POST', '/api/v1/remote-computers/1/check', null],
  ]);
});

test('Turn on changes nothing for a server that needs a test, is not yours or is gone', async () => {
  const cases = [
    [{ id: 'c1', enabled: false, state: 'not_tested', can_manage: true, revision: 1 }, 'computers.error.serverNotTested'],
    [{ id: 'c1', enabled: false, state: 'disabled', can_manage: false, revision: 1 }, 'computers.error.serverNotYours'],
    [{ id: 'gone', enabled: false, state: 'disabled', can_manage: true, revision: 1 }, 'computers.error.serverNotFound'],
  ];
  for (const [server, key] of cases) {
    const calls = routes({ 'GET /api/v1/integrations/custom-mcp/connections': [server] });
    await assert.rejects(turnOnComputer(computer({ state: 'disabled' })), (err) => remoteFailureKey(err) === key, key);
    assert.deepEqual(calls.map(([method]) => method), ['GET'], key);
  }
  // The server changed between the read and the call: said in words, not "Conflict".
  assert.equal(remoteFailureKey(new ApiError(409, 'Conflict', 'connection_changed')), 'computers.error.serverChanged');
  for (const key of ['computers.error.serverNotTested', 'computers.error.serverNotYours', 'computers.error.serverChanged', 'computers.card.turnOn', 'computers.live.clipboard']) {
    assert.ok(key in computersMessages.en, key);
  }
});
