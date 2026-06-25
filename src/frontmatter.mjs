/**
 * Dependency-free YAML-frontmatter parsing and serialization for SSSS files.
 *
 * SSSS files are Markdown with a leading `---`-fenced YAML frontmatter block
 * (spec §4.1). The canonical engine avoids a YAML dependency: it parses the
 * subset SSSS actually uses — top-level scalars, inline `[a, b]` arrays, block
 * `- item` arrays, and block scalars — which is sufficient to resolve a file's
 * `type` and validate field presence against the registry (§5, §9).
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

/**
 * Parse a frontmatter block (the inner YAML, no fences) into an object.
 * Returns top-level keys only; nested maps are returned as `{}` placeholders
 * (presence is what the registry validator needs).
 */
export function parseFrontmatter(fm) {
  const data = {};
  if (!fm) return data;
  const lines = fm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) continue; // sub-entry of a block handled below
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rest = m[2];
    if (rest === '') {
      // Could open a block list or a nested map. Peek ahead.
      const items = [];
      let isList = false;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const sub = lines[j];
        if (!sub.trim()) continue;
        if (!/^\s/.test(sub)) break; // dedent → block ended
        const li = sub.match(/^\s*-\s*(.*)$/);
        if (li) { isList = true; items.push(coerce(li[1])); }
        else break; // nested map; we only need presence
      }
      data[key] = isList ? items : {};
      i = isList ? j - 1 : i;
    } else {
      data[key] = coerce(rest);
    }
  }
  return data;
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

/** Serialize a frontmatter object + body back into an SSSS document. */
export function serializeDocument(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) continue; // skip nested maps we can't round-trip
    lines.push(`${k}: ${serializeValue(v)}`);
  }
  lines.push('---');
  const b = body == null ? '' : (body.startsWith('\n') ? body : `\n${body}`);
  return lines.join('\n') + b;
}
