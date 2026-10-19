#!/usr/bin/env node
// Regression checks for src/frontmatter.mjs: the dependency-free parser must read
// the YAML that real tools (Total Recall via js-yaml, editors, agents) write.
import assert from 'node:assert/strict';
import { parseFrontmatter, parseDocument, serializeDocument } from '../src/frontmatter.mjs';

const parse = (...lines) => parseFrontmatter(lines.join('\n') + '\n');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✅ ${name}`); };

check('hyphenated and dotted keys are kept', () => {
  assert.deepEqual(parse('allowed-tools: [Read, Bash]', 'a.b: 1', 'my key: v'),
    { 'allowed-tools': ['Read', 'Bash'], 'a.b': 1, 'my key': 'v' });
});

check('a colon without a following space is part of the value, not a key', () => {
  assert.deepEqual(parse('tags:', '  - context:universal', '  - kind:rule', 'url: http://x.io/a:b'),
    { tags: ['context:universal', 'kind:rule'], url: 'http://x.io/a:b' });
  assert.deepEqual(parse('tags: [context:universal, b]'), { tags: ['context:universal', 'b'] });
});

check('quoted commas and brackets survive inline arrays', () => {
  assert.deepEqual(parse('k: ["a", "b, c", \'d, e\', "[x]"]'), { k: ['a', 'b, c', 'd, e', '[x]'] });
});

check('JSON flow maps and arrays of JSON objects parse', () => {
  assert.deepEqual(parse('decay: {"half_life_days":180,"floor":0.5}'), { decay: { half_life_days: 180, floor: 0.5 } });
  assert.deepEqual(parse('x_citations: [{"source":"cli","title":"a, b","url":"https://e.io/?q=1"}]'),
    { x_citations: [{ source: 'cli', title: 'a, b', url: 'https://e.io/?q=1' }] });
  assert.deepEqual(parse('m: {a: 1, b: [x, y], c: {d: true}}'), { m: { a: 1, b: ['x', 'y'], c: { d: true } } });
  assert.deepEqual(parse('e: {}', 'f: []'), { e: {}, f: [] });
});

check('malformed flow values fall back to the raw text', () => {
  assert.deepEqual(parse('k: [a, b'), { k: '[a, b' });
});

check('wrapped plain and quoted scalars fold into one value', () => {
  assert.deepEqual(parse('description: This is a long', '  description that wraps', 'next: 1'),
    { description: 'This is a long description that wraps', next: 1 });
  assert.deepEqual(parse('q: "one', '  two"', 'n: 2'), { q: 'one two', n: 2 });
  assert.deepEqual(parse('l:', '  - first', '    second', '  - third'), { l: ['first second', 'third'] });
});

check('inline comments are stripped from plain values only', () => {
  assert.deepEqual(parse('a: Ship it # todo', 'b: "keep # this"', 'c: x#y', 'd: 5 # five', 'e: # nothing'),
    { a: 'Ship it', b: 'keep # this', c: 'x#y', d: 5, e: {} });
});

check('same-indent block lists and list items with block scalars parse', () => {
  assert.deepEqual(parse('tags:', '- a', '- b', 'next: 1'), { tags: ['a', 'b'], next: 1 });
  assert.deepEqual(parse('related:', '  - >-', '    folded', '    text', '  - plain'),
    { related: ['folded text', 'plain'] });
});

check('arrays of maps keep nested children and wrapped values', () => {
  assert.deepEqual(parse('items:', '  - name: x', '    sub:', '      a: 1', '    z: 2', '  - name: y'),
    { items: [{ name: 'x', sub: { a: 1 }, z: 2 }, { name: 'y' }] });
  assert.deepEqual(parse('items:', '  - source:', '      kind: a', '    n: 1'), { items: [{ source: { kind: 'a' }, n: 1 }] });
});

check('YAML double-quoted escapes decode (\\U, \\x, \\e)', () => {
  assert.deepEqual(parse('t: "\\U0001F534 \\x41 \\e"'), { t: '\u{1F534} A \x1b' });
});

check('folded block scalars keep the break around more-indented lines', () => {
  assert.deepEqual(parse('c: >', '  a', '    b', '', '  c'), { c: 'a\n  b\n\nc\n' });
  assert.deepEqual(parse('c: >-', '  a', '  b', '', '  c'), { c: 'a b\nc' });
});

check('numbers, codes and booleans keep their types', () => {
  assert.deepEqual(parse('a: 07003', 'b: 12', 'c: 1.5', 'd: 1e3', 'e: True', 'f: NULL', 'g: 0x1F'),
    { a: '07003', b: 12, c: 1.5, d: 1000, e: true, f: null, g: 31 });
});

check('unusual bare keys, nested sequences and keep-chomped blanks parse', () => {
  assert.deepEqual(parse('users:', '  a@b.com:', '    n: 1', 'last*seen: x'), { users: { 'a@b.com': { n: 1 } }, 'last*seen': 'x' });
  assert.deepEqual(parse('head:', '  - - meta', '    - http-equiv: refresh', '      content: go'),
    { head: [['meta', { 'http-equiv': 'refresh', content: 'go' }]] });
  assert.deepEqual(parse('c: |+', '', 'next: 1'), { c: '\n', next: 1 });
});

check('single-line files with literal \\n are repaired on read', () => {
  const flat = '---\\ntype: "memory"\\ntags: ["a","b"]\\n---\\nBody line\\nTwo';
  const { data, body } = parseDocument(flat);
  assert.deepEqual(data, { type: 'memory', tags: ['a', 'b'] });
  assert.equal(body, 'Body line\nTwo\n');
  // A real multi-line document that merely mentions \\n is untouched.
  assert.equal(parseDocument('---\nk: a\\nb\n---\n').data.k, 'a\\nb');
});

check('serialize → parse round-trips tricky values', () => {
  const data = {
    'allowed-tools': ['Read', 'Bash'],
    note: 'a, b: c # d',
    tags: ['context:universal', 'x, y', '-lead', '07003', 'true'],
    nested: { 'odd key': { n: 1 }, list: [[1, 2], [{ a: 'b, c' }]] },
    cites: [{ source: 'cli', title: 'a, b' }],
    empty: [],
    multi: 'line one\nline two'
  };
  const doc = serializeDocument(data, 'body\n');
  assert.deepEqual(parseDocument(doc).data, data);
  assert.equal(serializeDocument(parseDocument(doc).data, 'body\n'), doc);
});

console.log(`\n  ${passed}/${passed} frontmatter parser checks passed`);
