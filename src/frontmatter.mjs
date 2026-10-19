/**
 * Dependency-free YAML-frontmatter parsing and serialization for SSSS files.
 *
 * SSSS files are Markdown with a leading `---`-fenced YAML frontmatter block
 * (spec §4.1). The canonical engine avoids a YAML dependency: it parses the
 * subset SSSS actually uses (spec §4.5) — scalars, inline `[a, b]` arrays, block
 * `- item` arrays, nested maps, arrays of shallow maps, and `|`/`>` block
 * scalars — which is sufficient to
 * resolve a file's `type`, validate registry fields (§5, §9), and round-trip
 * operation patches without dropping nested frontmatter.
 */

/**
 * Repair a document a broken writer flattened onto one line with literal `\n`
 * text in place of newlines (`---\ntype: "memory"\n...`). Real documents with
 * any actual line break are returned unchanged.
 */
export function repairEscapedNewlines(content) {
  if (typeof content !== 'string' || !content.startsWith('---\\n') || content.trim().includes('\n')) return content;
  const fixed = content.replace(/\\n/g, '\n');
  return fixed.endsWith('\n') ? fixed : `${fixed}\n`;
}

/** Split a document into its raw frontmatter block and body. */
export function splitFrontmatter(content) {
  content = repairEscapedNewlines(content);
  if (typeof content !== 'string' || !content.startsWith('---')) {
    return { fm: '', body: content || '', hasFm: false };
  }
  const end = content.indexOf('\n---', 3);
  if (end < 0) return { fm: '', body: content, hasFm: false };
  const fmEnd = content.indexOf('\n', end + 1);
  const sliceEnd = fmEnd < 0 ? content.length : fmEnd + 1;
  // Inner YAML is between the opening fence line and the closing `---`.
  const firstNl = content.indexOf('\n');
  const inner = content.slice(firstNl + 1, end + 1);
  return { fm: inner, body: content.slice(sliceEnd), hasFm: true };
}

function countIndent(line) {
  const m = line.match(/^ */);
  return m ? m[0].length : 0;
}

/** Index of the quote that closes the quoted scalar starting at `v[0]`, or -1. */
function findClosingQuote(v) {
  const q = v[0];
  for (let i = 1; i < v.length; i++) {
    if (q === '"') {
      if (v[i] === '\\') i++;
      else if (v[i] === '"') return i;
    } else if (v[i] === "'") {
      if (v[i + 1] === "'") i++;
      else return i;
    }
  }
  return -1;
}

const YAML_ESCAPES = {
  0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029'
};

/** Decode a YAML double-quoted scalar body (a superset of JSON string escapes). */
function unescapeDouble(body) {
  return body.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|([\s\S]))/g, (m, x, u, U, c) => {
    const hex = x ?? u ?? U;
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.hasOwn(YAML_ESCAPES, c) ? YAML_ESCAPES[c] : m;
  });
}

function unquote(tok) {
  if (tok[0] === '"') {
    // Double-quoted scalars carry escapes; the serializer writes them with JSON.stringify.
    try { return JSON.parse(tok); } catch { return unescapeDouble(tok.slice(1, -1)); }
  }
  return tok.slice(1, -1).replace(/''/g, "'");
}

/** Drop a trailing ` # comment` from an unquoted value. */
function stripComment(v) {
  return v.replace(/(^|\s)#.*$/, '').trimEnd();
}

const INT_RE = /^[-+]?(?:0|[1-9]\d*)$/;
const FLOAT_RE = /^[-+]?(?:(?:0|[1-9]\d*)?\.\d+(?:[eE][-+]?\d+)?|(?:0|[1-9]\d*)(?:\.\d*)?[eE][-+]?\d+)$/;

function coercePlain(v) {
  if (v === 'true' || v === 'True' || v === 'TRUE') return true;
  if (v === 'false' || v === 'False' || v === 'FALSE') return false;
  if (v === 'null' || v === 'Null' || v === 'NULL' || v === '~') return null;
  // A leading zero (zip 07003, license 00123) marks a code, not a number.
  if (INT_RE.test(v)) return parseInt(v, 10);
  if (/^0x[0-9a-fA-F]+$/.test(v)) return parseInt(v.slice(2), 16);
  if (/^0o[0-7]+$/.test(v)) return parseInt(v.slice(2), 8);
  if (FLOAT_RE.test(v)) return parseFloat(v);
  return v;
}

/**
 * Parse an inline `[...]` / `{...}` value (JSON and YAML flow style). Quotes,
 * nested brackets and commas inside quoted strings are respected. Throws on
 * malformed input so the caller can fall back to the raw text.
 */
function parseFlow(src) {
  let pos = 0;
  const ws = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };
  const quoted = () => {
    const end = findClosingQuote(src.slice(pos));
    if (end < 0) throw new Error('unterminated quote');
    const tok = src.slice(pos, pos + end + 1);
    pos += end + 1;
    return unquote(tok);
  };
  const plain = (inKey) => {
    const start = pos;
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === ',' || ch === ']' || ch === '}') break;
      if (inKey && ch === ':' && (pos + 1 >= src.length || /[\s,\]}]/.test(src[pos + 1]))) break;
      pos++;
    }
    return src.slice(start, pos).trim();
  };
  const node = () => {
    ws();
    const ch = src[pos];
    if (ch === '[') return seq();
    if (ch === '{') return map();
    if (ch === '"' || ch === "'") return quoted();
    const p = plain(false);
    return p === '' ? null : coercePlain(p);
  };
  const seq = () => {
    pos++;
    const out = [];
    for (;;) {
      ws();
      if (pos >= src.length) throw new Error('unterminated sequence');
      if (src[pos] === ']') { pos++; return out; }
      out.push(node());
      ws();
      if (src[pos] === ',') pos++;
      else if (src[pos] !== ']') throw new Error('bad sequence');
    }
  };
  const map = () => {
    pos++;
    const out = {};
    for (;;) {
      ws();
      if (pos >= src.length) throw new Error('unterminated map');
      if (src[pos] === '}') { pos++; return out; }
      const key = src[pos] === '"' || src[pos] === "'" ? quoted() : plain(true);
      ws();
      if (src[pos] === ':') { pos++; out[key] = node(); } else out[key] = null;
      ws();
      if (src[pos] === ',') pos++;
      else if (src[pos] !== '}') throw new Error('bad map');
    }
  };
  const value = node();
  ws();
  if (pos < src.length && !src.slice(pos).startsWith('#')) throw new Error('trailing text');
  return value;
}

// Set by parseFrontmatter(fm, { strict: true }): malformed input throws instead of
// being skipped or kept as raw text.
let strictMode = false;

function coerce(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v[0] === '"' || v[0] === "'") {
    const end = findClosingQuote(v);
    if (end > 0 && /^\s*(#.*)?$/.test(v.slice(end + 1))) return unquote(v.slice(0, end + 1));
    if (strictMode) throw new SyntaxError(`Malformed quoted value: ${v.slice(0, 60)}`);
    return v;
  }
  if (v[0] === '[' || v[0] === '{') {
    try { return parseFlow(v); } catch (err) {
      if (strictMode) throw new SyntaxError(`Malformed inline value: ${v.slice(0, 60)}`);
      return v;
    }
  }
  return coercePlain(stripComment(v));
}

// A key is a bare word (no whitespace, `:` or `#`; inner single spaces allowed)
// or a quoted string, followed by `:` and then whitespace or end of line. The
// whitespace requirement keeps tags like `context:universal` and URLs as values.
const KEY_RE =
  /^(?:([A-Za-z0-9_][^\s:#]*(?: [^\s:#]+)*)|("(?:[^"\\]|\\.)*")|('(?:[^']|'')*')):(?:[ \t]+(.*))?$/;

function splitKeyValue(text) {
  const m = text.trimEnd().match(KEY_RE);
  if (!m) return null;
  const key = m[1] ?? unquote(m[2] ?? m[3]);
  const rest = (m[4] ?? '').trim();
  return { key, rest: rest.startsWith('#') ? '' : rest };
}

/**
 * Read a scalar or flow value that starts on `lines[i]` (already split into
 * `rest`) and may wrap onto deeper-indented continuation lines. Plain and
 * quoted lines fold with a space; a blank line is one newline.
 */
function readScalar(lines, i, keyIndent, rest) {
  const inline = /^["'[{]/.test(rest);
  let text = rest;
  let j = i + 1;
  let blanks = 0;
  let last = i;
  while (j < lines.length) {
    const line = lines[j];
    if (!line.trim()) { blanks++; j++; continue; }
    if (countIndent(line) <= keyIndent) break;
    if (!inline && line.trim().startsWith('#')) break;
    if (strictMode && !inline && splitKeyValue(line.trim())) throw new SyntaxError(`Unexpected key in a wrapped value: ${line.trim().slice(0, 60)}`);
    const piece = inline ? line.trim() : stripComment(line.trim());
    text += blanks ? '\n'.repeat(blanks) + piece : ` ${piece}`;
    blanks = 0;
    last = j;
    j++;
  }
  return { value: coerce(text), next: last + 1 };
}

function nextSignificant(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() && !lines[i].trim().startsWith('#')) return i;
  }
  return -1;
}

const BLOCK_SCALAR_RE = /^([|>])([+-]?)(?:\s+#.*)?$/;

/** Read a `|` (literal) or `>` (folded) block scalar with clip/strip/keep chomping. */
function parseBlockScalar(lines, start, parentIndent, style, chomp) {
  const raw = [];
  let blockIndent = null;
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { raw.push(''); i++; continue; }
    const indent = countIndent(line);
    if (indent <= parentIndent || (blockIndent !== null && indent < blockIndent)) break;
    blockIndent ??= indent;
    raw.push(line.slice(blockIndent));
    i++;
  }
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '') end--;
  const content = raw.slice(0, end);
  let text = content[0] ?? '';
  let prevText = 0; // index of the last non-blank line already emitted
  for (let k = 1; k < content.length; k++) {
    const line = content[k];
    if (line === '') continue;
    const blanks = k - prevText - 1;
    if (style === '|') text += `${'\n'.repeat(blanks + 1)}${line}`;
    // Folding: a break between two ordinary lines becomes a space, and blank
    // lines each add one newline; a more-indented line on either side keeps its break.
    else if (/^\s/.test(line) || /^\s/.test(content[prevText])) text += `${'\n'.repeat(blanks + 1)}${line}`;
    else text += blanks ? `${'\n'.repeat(blanks)}${line}` : ` ${line}`;
    prevText = k;
  }
  if (!content.length) text = chomp === '+' ? '\n'.repeat(raw.length) : '';
  else if (chomp === '+') text += '\n'.repeat(1 + raw.length - end);
  else if (chomp !== '-') text += '\n';
  return { value: text, next: i };
}

const isDash = (text) => text === '-' || text.startsWith('- ');

function parseMap(lines, start, indent) {
  const data = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const currentIndent = countIndent(line);
    if (currentIndent < indent) break;
    if (currentIndent > indent) {
      if (strictMode) throw new SyntaxError(`Unexpected indentation: ${line.trim().slice(0, 60)}`);
      i++;
      continue;
    }
    const kv = splitKeyValue(line.slice(indent));
    if (!kv) {
      if (strictMode) throw new SyntaxError(`Not a "key: value" line: ${line.trim().slice(0, 60)}`);
      i++;
      continue;
    }
    const block = kv.rest.match(BLOCK_SCALAR_RE);
    if (block) {
      const parsed = parseBlockScalar(lines, i + 1, indent, block[1], block[2]);
      data[kv.key] = parsed.value;
      i = parsed.next;
      continue;
    }
    if (kv.rest !== '') {
      const scalar = readScalar(lines, i, indent, kv.rest);
      data[kv.key] = scalar.value;
      i = scalar.next;
      continue;
    }

    const next = nextSignificant(lines, i + 1);
    // YAML allows a block list at the same indent as its key.
    const sameIndentList = next >= 0 && countIndent(lines[next]) === indent && isDash(lines[next].slice(indent));
    if (next < 0 || (countIndent(lines[next]) <= indent && !sameIndentList)) {
      data[kv.key] = {};
      i++;
      continue;
    }
    const childIndent = countIndent(lines[next]);
    if (isDash(lines[next].slice(childIndent))) {
      const parsed = parseList(lines, next, childIndent);
      data[kv.key] = parsed.value;
      i = parsed.next;
    } else {
      const parsed = parseMap(lines, next, childIndent);
      data[kv.key] = parsed.value;
      i = parsed.next;
    }
  }
  return { value: data, next: i };
}

function parseList(lines, start, indent) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const currentIndent = countIndent(line);
    if (currentIndent < indent) break;
    if (currentIndent > indent) { i++; continue; }
    const item = line.slice(indent).match(/^-(?:(\s+)(.*))?$/);
    if (!item) break;
    const raw = (item[2] ?? '').trim();
    const keyIndent = indent + 1 + (item[1] ?? '').length;
    const kv = splitKeyValue(raw);
    if (kv) {
      // Re-read the item as a map whose first key sits where the dash was, so
      // nested children, block scalars and wrapped values of every key parse alike.
      lines[i] = ' '.repeat(keyIndent) + raw;
      const parsed = parseMap(lines, i, keyIndent);
      items.push(parsed.value);
      i = parsed.next;
    } else if (isDash(raw)) {
      // Nested sequence (`- - a`): re-read the inner dash as its own list item.
      lines[i] = ' '.repeat(keyIndent) + raw;
      const parsed = parseList(lines, i, keyIndent);
      items.push(parsed.value);
      i = parsed.next;
    } else if (raw === '' || raw.startsWith('#')) {
      const next = nextSignificant(lines, i + 1);
      if (next >= 0 && countIndent(lines[next]) > indent) {
        const parsed = parseMap(lines, next, countIndent(lines[next]));
        items.push(parsed.value);
        i = parsed.next;
      } else {
        items.push('');
        i++;
      }
    } else if (BLOCK_SCALAR_RE.test(raw)) {
      const block = raw.match(BLOCK_SCALAR_RE);
      const parsed = parseBlockScalar(lines, i + 1, indent, block[1], block[2]);
      items.push(parsed.value);
      i = parsed.next;
    } else {
      const scalar = readScalar(lines, i, indent, raw);
      items.push(scalar.value);
      i = scalar.next;
    }
  }
  return { value: items, next: i };
}

/**
 * Parse a frontmatter block (the inner YAML, no fences) into an object. The
 * default is lenient: unreadable lines are skipped. `{ strict: true }` throws a
 * SyntaxError on lines that are not `key: value`, orphaned indentation, and
 * malformed quoted or inline values, so callers can report unreadable files.
 */
export function parseFrontmatter(fm, { strict = false } = {}) {
  if (!fm) return {};
  const previous = strictMode;
  strictMode = strict;
  try {
    // Drop the newline before the closing fence so it is not read as a blank line.
    return parseMap(fm.replace(/\n$/, '').split('\n'), 0, 0).value;
  } finally {
    strictMode = previous;
  }
}

/** Parse a full document (with fences) into { data, body }. */
export function parseDocument(content) {
  const { fm, body } = splitFrontmatter(content);
  return { data: parseFrontmatter(fm), body };
}

const LOOKS_TYPED =
  /^(?:[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|[-+]?\.\d+|0[xXoObB][0-9a-fA-F_]+|true|false|yes|no|on|off|null|~|\.inf|\.nan)$/i;

function serializeValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => serializeValue(x)).join(', ')}]`;
  // Nested objects inside an inline array go out as JSON, which the flow parser reads back.
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (s === '' || /[:#,\[\]{}"'\\\n\r\t|>]/.test(s) || /^\s|\s$/.test(s) || /^[-?!&*%@`]/.test(s)) return JSON.stringify(s);
  // A string that would read back as a number, boolean or null stays quoted,
  // so "07003" and "true" survive a round trip (here and in YAML 1.1 readers).
  if (LOOKS_TYPED.test(s)) return JSON.stringify(s);
  return s;
}

function serializeKey(key) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/.test(key) ? key : JSON.stringify(key);
}

function serializeEntry(lines, rawKey, value, indent = 0) {
  const key = serializeKey(rawKey);
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      lines.push(`${pad}${key}: []`);
      return;
    }
    lines.push(`${pad}${key}:`);
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (!entries.length) {
          lines.push(`${pad}  - {}`);
          continue;
        }
        const [first, ...rest] = entries;
        if (first[1] && typeof first[1] === 'object' && !Array.isArray(first[1])) {
          lines.push(`${pad}  - ${serializeKey(first[0])}:`);
          serializeObject(lines, first[1], indent + 6);
        } else {
          lines.push(`${pad}  - ${serializeKey(first[0])}: ${serializeValue(first[1])}`);
        }
        for (const [childKey, childValue] of rest) serializeEntry(lines, childKey, childValue, indent + 4);
      } else {
        lines.push(`${pad}  - ${serializeValue(item)}`);
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    lines.push(`${pad}${key}:`);
    serializeObject(lines, value, indent + 2);
    return;
  }
  lines.push(`${pad}${key}: ${serializeValue(value)}`);
}

function serializeObject(lines, obj, indent) {
  for (const [k, v] of Object.entries(obj)) serializeEntry(lines, k, v, indent);
}

/** Serialize a frontmatter object + body back into an SSSS document. */
export function serializeDocument(data, body) {
  const lines = ['---'];
  serializeObject(lines, data, 0);
  lines.push('---');
  const b = body == null ? '' : (body.startsWith('\n') ? body : `\n${body}`);
  return lines.join('\n') + b;
}
