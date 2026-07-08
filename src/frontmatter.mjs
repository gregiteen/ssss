/**
 * Dependency-free YAML-frontmatter parsing and serialization for SSSS files.
 *
 * SSSS files are Markdown with a leading `---`-fenced YAML frontmatter block
 * (spec §4.1). The canonical engine avoids a YAML dependency: it parses the
 * subset SSSS actually uses — scalars, inline `[a, b]` arrays, block `- item`
 * arrays, nested maps, and arrays of shallow maps — which is sufficient to
 * resolve a file's `type`, validate registry fields (§5, §9), and round-trip
 * operation patches without dropping nested frontmatter.
 */

/** Split a document into its raw frontmatter block and body. */
export function splitFrontmatter(content) {
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

function coerce(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => coerce(s));
  }
  return v;
}

function countIndent(line) {
  const m = line.match(/^ */);
  return m ? m[0].length : 0;
}

function splitKeyValue(text) {
  const m = text.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
  return m ? { key: m[1], rest: m[2] } : null;
}

function nextSignificant(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() && !lines[i].trim().startsWith('#')) return i;
  }
  return -1;
}

function parseMap(lines, start, indent) {
  const data = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const currentIndent = countIndent(line);
    if (currentIndent < indent) break;
    if (currentIndent > indent) { i++; continue; }
    const kv = splitKeyValue(line.slice(indent));
    if (!kv) { i++; continue; }
    if (kv.rest !== '') {
      data[kv.key] = coerce(kv.rest);
      i++;
      continue;
    }

    const next = nextSignificant(lines, i + 1);
    if (next < 0 || countIndent(lines[next]) <= indent) {
      data[kv.key] = {};
      i++;
      continue;
    }
    const childIndent = countIndent(lines[next]);
    if (lines[next].slice(childIndent).startsWith('- ')) {
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
    const item = line.slice(indent).match(/^-\s*(.*)$/);
    if (!item) break;
    const raw = item[1];
    const kv = splitKeyValue(raw);
    if (kv) {
      const obj = { [kv.key]: kv.rest === '' ? {} : coerce(kv.rest) };
      i++;
      const next = nextSignificant(lines, i);
      if (next >= 0 && countIndent(lines[next]) > indent) {
        const parsed = parseMap(lines, next, countIndent(lines[next]));
        Object.assign(obj, parsed.value);
        i = parsed.next;
      }
      items.push(obj);
    } else if (raw === '') {
      const next = nextSignificant(lines, i + 1);
      if (next >= 0 && countIndent(lines[next]) > indent) {
        const parsed = parseMap(lines, next, countIndent(lines[next]));
        items.push(parsed.value);
        i = parsed.next;
      } else {
        items.push('');
        i++;
      }
    } else {
      items.push(coerce(raw));
      i++;
    }
  }
  return { value: items, next: i };
}

/**
 * Parse a frontmatter block (the inner YAML, no fences) into an object.
 */
export function parseFrontmatter(fm) {
  if (!fm) return {};
  return parseMap(fm.split('\n'), 0, 0).value;
}

/** Parse a full document (with fences) into { data, body }. */
export function parseDocument(content) {
  const { fm, body } = splitFrontmatter(content);
  return { data: parseFrontmatter(fm), body };
}

function serializeValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => serializeValue(x)).join(', ')}]`;
  const s = String(v);
  if (s === '' || /[:#\[\]{}"']/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

function serializeEntry(lines, key, value, indent = 0) {
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
          lines.push(`${pad}  - ${first[0]}:`);
          serializeObject(lines, first[1], indent + 6);
        } else {
          lines.push(`${pad}  - ${first[0]}: ${serializeValue(first[1])}`);
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
