import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonlEventStore, createCanonicalEvent } from '../src/events.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-event-stream-'));
const file = path.join(root, 'acme.jsonl');
const make = index => createCanonicalEvent({
  workspace_id: 'acme', action: 'event', subject: 'stream-test',
  principal: { id: 'test', kind: 'service' }, operation_id: `operation-${index}`,
  idempotency_key: `key-${index}`, payload: { text: 'a'.repeat(65500) + '🧠é'.repeat(25000) }
});
const events = [make(1), make(2)];
const originals = { alloc: Buffer.alloc, readFileSync: fs.readFileSync, readSync: fs.readSync };
try {
  fs.writeFileSync(file, events.map(event => JSON.stringify(event)).join('\n') + '\n');
  Buffer.alloc = (size, ...rest) => { assert.ok(size <= 65536, 'Event reader allocated the whole log'); return originals.alloc(size, ...rest); };
  fs.readFileSync = (target, ...rest) => { assert.notEqual(target, file, 'Event reader loaded the whole log'); return originals.readFileSync(target, ...rest); };
  let largestRead = 0;
  fs.readSync = (fd, buffer, offset, length, position) => {
    largestRead = Math.max(largestRead, length);
    assert.ok(length <= 65536, 'Event reader requested the whole log');
    return originals.readSync(fd, buffer, offset, Math.min(length, 4093), position);
  };
  const store = new JsonlEventStore(root);
  await assert.rejects(store.append(events[0]), /Duplicate event_id/);
  const third = make(3);
  await store.append(third);
  const replayed = [];
  for await (const entry of store.replay({ workspaceId: 'acme', cursor: 1 })) replayed.push(entry);
  assert.deepEqual(replayed.map(entry => entry.cursor), [2, 3]);
  assert.deepEqual(replayed.map(entry => entry.event), [events[1], third]);
  await assert.rejects(new JsonlEventStore(root).append(third), /Duplicate event_id/);
  fs.appendFileSync(file, '{invalid JSON}\n');
  await assert.rejects(new JsonlEventStore(root).append(make(4)), SyntaxError);

  // Rotation: an append-only log must stay bounded, and rotating it must not
  // reorder, drop or duplicate a single event. Live-first ordering was a real
  // bug: archives hold the OLDER events, so they replay first.
  const rotateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-event-rotate-'));
  try {
    const cap = 2048;
    const store = new JsonlEventStore(rotateRoot, { maxBytes: cap });
    const total = 40;
    const expected = [];
    for (let i = 0; i < total; i++) {
      const event = createCanonicalEvent({
        workspace_id: 'default', action: 'event', subject: `subject-${i}`,
        principal: { id: 'test', kind: 'service' }, operation_id: `operation-${i}`,
        idempotency_key: `key-${i}`, payload: { filler: 'b'.repeat(400) }
      });
      expected.push(event.event_id);
      await store.append(event);
    }
    const live = path.join(rotateRoot, 'default.jsonl');
    assert.ok(fs.statSync(live).size <= cap, 'Live log exceeded the rotation cap');
    const segments = fs.readdirSync(rotateRoot).filter(name => /^default\.\d+\.jsonl$/.test(name));
    assert.ok(segments.length > 0, 'Expected the log to rotate at least once');

    const replayed = [];
    for await (const entry of store.replay({ workspaceId: 'default' })) replayed.push(entry.event.event_id);
    assert.deepEqual(replayed, expected, 'Rotation reordered, dropped or duplicated events');

    // A cursor must resume a stable position across rotation.
    const from = 12;
    const resumed = [];
    for await (const entry of store.replay({ workspaceId: 'default', cursor: from })) resumed.push(entry.cursor);
    assert.deepEqual(resumed, Array.from({ length: total - from }, (_, i) => from + i + 1), 'Cursor resume shifted across rotation');

    // Uniqueness must survive rotation: the index is rebuilt from archives.
    await assert.rejects(new JsonlEventStore(rotateRoot, { maxBytes: cap }).append(
      createCanonicalEvent({
        event_id: expected[0], workspace_id: 'default', action: 'event', subject: 'dupe',
        principal: { id: 'test', kind: 'service' }, operation_id: 'operation-dupe',
        idempotency_key: 'key-dupe', payload: {}
      })
    ), /Duplicate event_id/, 'Rotation lost duplicate detection');
    console.log(JSON.stringify({ ok: true, boundedReads: true, utf8: true, cursor: true, duplicate: true, corruptFailClosed: true, largestRead, rotation: { segments: segments.length, ordered: true, capped: true } }));
  } finally {
    fs.rmSync(rotateRoot, { recursive: true });
  }
} finally {
  Buffer.alloc = originals.alloc; fs.readFileSync = originals.readFileSync; fs.readSync = originals.readSync;
  fs.rmSync(root, { recursive: true });
}
