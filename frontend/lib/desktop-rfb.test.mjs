import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DesktopRfb, framePoint, keysymFor, pointerMask, REMOTE_DESKTOP_LIMITS } from './desktop-rfb.ts';

test('keys map to X11 keysyms: named keys, Latin-1 as is, other characters as Unicode keysyms', () => {
  assert.equal(keysymFor('Enter'), 0xff0d);
  assert.equal(keysymFor('a'), 0x61);
  assert.equal(keysymFor('é'), 0xe9);
  assert.equal(keysymFor('中'), 0x01004e2d);
  assert.equal(keysymFor('😀'), 0x01000000 + 0x1f600);
  assert.equal(keysymFor('F13'), undefined);
  assert.equal(keysymFor('Dead'), undefined);
});

test('pointer buttons: left 1, middle 2, right 4', () => {
  assert.equal(pointerMask(0), 0);
  assert.equal(pointerMask(1), 1);
  assert.equal(pointerMask(4), 2);
  assert.equal(pointerMask(2), 4);
  assert.equal(pointerMask(3), 5);
});

test('a pointer on a letterboxed canvas lands on the remote screen, clamped to it', () => {
  // A 1280x960 (4:3) screen drawn in a 1600x900 box: 1200x900 picture, 200 px bars left and right.
  const box = { left: 100, top: 50, width: 1600, height: 900 };
  assert.deepEqual(framePoint(100 + 200, 50, box, 1280, 960), { x: 0, y: 0 });
  assert.deepEqual(framePoint(100 + 800, 50 + 450, box, 1280, 960), { x: 640, y: 480 });
  assert.deepEqual(framePoint(100 + 10, 50 + 450, box, 1280, 960), { x: 0, y: 480 });
  assert.deepEqual(framePoint(100 + 1590, 50 + 899, box, 1280, 960).x, 1279);
  // Same aspect ratio: the plain scale.
  assert.deepEqual(framePoint(64, 40, { left: 0, top: 0, width: 640, height: 400 }, 1280, 800), { x: 128, y: 80 });
  assert.deepEqual(framePoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 1280, 800), { x: 0, y: 0 });
});

test('the remote limits allow a larger screen and a full raw frame of it', () => {
  const sent = [];
  const client = new DesktopRfb({ send: (b) => sent.push(b), ready: () => {}, rectangle: () => {}, frame: () => {} }, REMOTE_DESKTOP_LIMITS);
  client.push(new TextEncoder().encode('RFB 003.008\n'));
  client.push(new Uint8Array([1, 1, 0, 0, 0, 0]));
  const init = new Uint8Array(24);
  new DataView(init.buffer).setUint16(0, 1920);
  new DataView(init.buffer).setUint16(2, 1080);
  client.push(init);
  assert.equal(client.width, 1920);
  // One 1920x1080 raw rectangle (8.3 MB) is more than the Docker desktop's 8 MB buffer.
  const header = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0, 7, 128, 4, 56, 0, 0, 0, 0]);
  client.push(header);
  assert.doesNotThrow(() => client.push(new Uint8Array(1920 * 1080 * 4)));
});
function setup() { const sent=[], frames=[], ready=[]; const client=new DesktopRfb({send:b=>sent.push(b), ready:(...a)=>ready.push(a), rectangle:(...a)=>frames.push(a), frame:()=>{}}); return {client,sent,frames,ready}; }
function initialized(c) { c.push(new TextEncoder().encode('RFB 003.008\n')); c.push(new Uint8Array([1,1,0,0,0,0])); const init=new Uint8Array(24); const v=new DataView(init.buffer); v.setUint16(0,2); v.setUint16(2,1); c.push(init); }
test('RFB handshake and raw frame survive byte-by-byte chunks',()=> {const {client,sent,frames,ready}=setup(); initialized(client); assert.deepEqual(ready,[[2,1]]); assert.equal(sent.length,6); const update=new Uint8Array([0,0,0,1,0,0,0,0,0,2,0,1,0,0,0,0,3,2,1,0,6,5,4,0]); for (const b of update) client.push(new Uint8Array([b])); assert.equal(frames.length,1); assert.deepEqual([...frames[0][4]],[1,2,3,255,4,5,6,255]); });
test('RFB rejects unsupported version/security, huge names, rectangles outside the frame',()=>{ assert.throws(()=>setup().client.push(new TextEncoder().encode('RFB 003.003\n'))); let c=setup().client; c.push(new TextEncoder().encode('RFB 003.008\n')); assert.throws(()=>c.push(new Uint8Array([1,2]))); c=setup().client; initialized(c); assert.throws(()=>c.push(new Uint8Array([0,0,0,1,0,0,0,0,0,3,0,1,0,0,0,0]))); c=setup().client; c.push(new TextEncoder().encode('RFB 003.008\n')); c.push(new Uint8Array([1,1,0,0,0,0])); const init=new Uint8Array(24); new DataView(init.buffer).setUint32(20,0xffffffff); assert.throws(()=>c.push(init)); });
test('RFB bounds memory and explicitly encodes pointer and unicode keys',()=> {const {client,sent}=setup(); initialized(client); client.pointer(999,-10,1); assert.deepEqual([...sent.at(-1)],[5,1,0,1,0,0]); client.text('é中'); assert.equal(new DataView(sent.at(-1).buffer).getUint32(4),0x01004e2d); assert.throws(()=>client.push(new Uint8Array(8*1024*1024+1))); });
