import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { API_BASE } from './api.ts';
import {
  checkRemoteComputer, createRemoteComputer, deleteRemoteComputer, handBack, listRemoteComputers,
  remoteComputerScreenshotUrl, remoteViewerSocketUrl, takeControl, updateRemoteComputer, viewerTicket,
} from './remote-computers.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function respond(status, body) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(options.body) : undefined });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('each call uses its route and method', async () => {
  const calls = respond(200, { id: 3 });
  await listRemoteComputers();
  await createRemoteComputer({ name: 'Atlas desktop', mcp_connection_id: 'c1', agent_id: 7 });
  await updateRemoteComputer(3, { name: 'Atlas' });
  await checkRemoteComputer(3);
  await takeControl(3);
  await handBack(3);
  await viewerTicket(3, 'view');
  assert.deepEqual(calls.map((c) => [c.method, c.url.slice(API_BASE.length)]), [
    ['GET', '/remote-computers'],
    ['POST', '/remote-computers'],
    ['PATCH', '/remote-computers/3'],
    ['POST', '/remote-computers/3/check'],
    ['POST', '/remote-computers/3/take-control'],
    ['POST', '/remote-computers/3/hand-back'],
    ['POST', '/remote-computers/3/viewer-ticket'],
  ]);
  assert.deepEqual(calls[1].body, { name: 'Atlas desktop', mcp_connection_id: 'c1', agent_id: 7 });
  assert.deepEqual(calls[6].body, { mode: 'view' });
});

test('unlinking sends agent_id null, and a rename sends only the name', async () => {
  const calls = respond(200, { id: 3 });
  await updateRemoteComputer(3, { agent_id: null });
  await updateRemoteComputer(3, { name: 'Desk' });
  assert.deepEqual(calls[0].body, { agent_id: null });
  assert.deepEqual(calls[1].body, { name: 'Desk' });
});

test('removing a link answers nothing', async () => {
  const calls = respond(204, null);
  assert.equal(await deleteRemoteComputer(5), undefined);
  assert.equal(calls[0].method, 'DELETE');
});

test('a refused call keeps its error code', async () => {
  respond(409, { detail: { error_code: 'agent_already_linked' } });
  await assert.rejects(createRemoteComputer({ name: 'x', mcp_connection_id: 'c' }), (err) => err.code === 'agent_already_linked' && err.status === 409);
});

test('the screenshot address changes with its cache buster', () => {
  assert.equal(remoteComputerScreenshotUrl(4, 17), `${API_BASE}/remote-computers/4/screenshot?t=17`);
  assert.notEqual(remoteComputerScreenshotUrl(4, 1), remoteComputerScreenshotUrl(4, 2));
  assert.equal(remoteComputerScreenshotUrl(4, 'a b'), `${API_BASE}/remote-computers/4/screenshot?t=a%20b`);
});

test('the viewer socket opens on the API origin with ws or wss', () => {
  const path = '/api/v1/remote-computers/4/viewer?ticket=abc';
  const url = new URL(remoteViewerSocketUrl(path, 'https://agent.example.com/agents/1'));
  const api = new URL(API_BASE, 'https://agent.example.com/agents/1');
  assert.equal(url.protocol, api.protocol === 'https:' ? 'wss:' : 'ws:');
  assert.equal(url.host, api.host);
  assert.equal(url.pathname, '/api/v1/remote-computers/4/viewer');
  assert.equal(url.searchParams.get('ticket'), 'abc');
});
