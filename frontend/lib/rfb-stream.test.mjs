import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REMOTE_DESKTOP_LIMITS } from './desktop-rfb.ts';
import { openRfbStream } from './rfb-stream.ts';

class FakeSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 1;
    this.sent = [];
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  send(bytes) { this.sent.push([...bytes]); }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; queueMicrotask(() => this.onclose?.({ code: 1000 })); }
  receive(bytes) { this.onmessage?.({ data: new Uint8Array(bytes).buffer }); }
  drop(code) { this.readyState = 3; this.onclose?.({ code }); }
}

function handshake(socket, width = 2, height = 1) {
  socket.receive(new TextEncoder().encode('RFB 003.008\n'));
  socket.receive([1, 1]);
  socket.receive([0, 0, 0, 0]);
  const init = new Uint8Array(24);
  const view = new DataView(init.buffer);
  view.setUint16(0, width);
  view.setUint16(2, height);
  socket.receive(init);
}

function open(options = {}) {
  let socket;
  const events = [];
  const stream = openRfbStream({
    url: 'wss://example.test/viewer?ticket=t',
    canvas: () => null,
    refreshMs: 0,
    firstFrameMs: 50,
    socket: (url, protocols) => (socket = new FakeSocket(url, protocols)),
    onReady: (width, height) => events.push(['ready', width, height]),
    onLive: () => events.push(['live']),
    onEnd: (end) => events.push(['end', end]),
    ...options,
  });
  return { stream, socket, events };
}

const EMPTY_UPDATE = [0, 0, 0, 0];

test('asks for no subprotocol unless told to, and shakes hands', () => {
  const { socket, events } = open();
  assert.equal(socket.protocols, undefined);
  assert.equal(socket.binaryType, 'arraybuffer');
  handshake(socket);
  assert.deepEqual(events, [['ready', 2, 1]]);
  // Version, security type, ClientInit, SetPixelFormat, SetEncodings, the first update request.
  assert.equal(socket.sent.length, 6);
  assert.equal(open({ protocols: 'binary' }).socket.protocols, 'binary');
});

test('the first frame makes it live once, and the next update is asked for', async () => {
  const { socket, events, stream } = open();
  handshake(socket);
  socket.receive(EMPTY_UPDATE);
  socket.receive(EMPTY_UPDATE);
  assert.deepEqual(events.filter(([kind]) => kind === 'live'), [['live']]);
  const before = socket.sent.length;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(socket.sent.length > before);
  assert.equal(socket.sent.at(-1)[0], 3);
  stream.close();
});

test('no picture in time ends with timeout and closes the socket', async () => {
  const { socket, events } = open();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(events.at(-1), ['end', { kind: 'timeout' }]);
  assert.equal(socket.closed, true);
  assert.equal(events.filter(([kind]) => kind === 'end').length, 1);
});

test('a broken stream ends with protocol; a dropped one says whether it was live', () => {
  const broken = open();
  broken.socket.receive(new TextEncoder().encode('RFB 003.003\n'));
  assert.equal(broken.events.at(-1)[1].kind, 'protocol');

  const dropped = open();
  handshake(dropped.socket);
  dropped.socket.receive(EMPTY_UPDATE);
  dropped.socket.drop(4409);
  assert.deepEqual(dropped.events.at(-1), ['end', { kind: 'closed', code: 4409, live: true }]);

  const early = open();
  early.socket.drop(4403);
  assert.deepEqual(early.events.at(-1), ['end', { kind: 'closed', code: 4403, live: false }]);
});

test('close() ends quietly: nothing is reported or sent after it', async () => {
  const { socket, events, stream } = open();
  handshake(socket);
  stream.close();
  const sent = socket.sent.length;
  stream.client.pointer(1, 1, 1);
  socket.receive(EMPTY_UPDATE);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(socket.sent.length, sent);
  assert.equal(events.some(([kind]) => kind === 'end' || kind === 'live'), false);
});

test('a cloud computer may be larger than a Docker desktop', () => {
  const docker = open();
  docker.socket.receive(new TextEncoder().encode('RFB 003.008\n'));
  docker.socket.receive([1, 1]);
  docker.socket.receive([0, 0, 0, 0]);
  const init = new Uint8Array(24);
  new DataView(init.buffer).setUint16(0, 1280);
  new DataView(init.buffer).setUint16(2, 960);
  docker.socket.receive(init);
  assert.equal(docker.events.at(-1)[1].kind, 'protocol');

  const remote = open({ limits: REMOTE_DESKTOP_LIMITS });
  handshake(remote.socket, 1280, 960);
  assert.deepEqual(remote.events, [['ready', 1280, 960]]);
  remote.stream.close();
});
