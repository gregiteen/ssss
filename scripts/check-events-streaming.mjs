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
  console.log(JSON.stringify({ ok: true, boundedReads: true, utf8: true, cursor: true, duplicate: true, corruptFailClosed: true, largestRead }));
} finally {
  Buffer.alloc = originals.alloc; fs.readFileSync = originals.readFileSync; fs.readSync = originals.readSync;
  fs.rmSync(root, { recursive: true });
}
