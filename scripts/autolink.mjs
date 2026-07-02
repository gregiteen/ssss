#!/usr/bin/env node
/**
 * ssss autolink — OKF wiki-autolinker for an SSSS vault.
 *
 * Two layers, by design (mirrors the SSSS thesis: semantics enriches at
 * authoring time; the deterministic contract is never touched):
 *
 *   1. Deterministic core (default, no network): links exact surface forms —
 *      every primitive's `title`, `aliases`, `name`, and `slug` — using
 *      absolute bundle-relative paths (spec §4.3). Code spans/blocks, existing
 *      links, headings, and URLs are protected. First occurrence per target
 *      only. Idempotent: re-running adds nothing.
 *
 *   2. Semantic layer (--semantic, uses the Anthropic API): links by MEANING —
 *      a body that talks about "writing files atomically" links to the
 *      `prefer-atomic-writes` memory even with no exact title match. This is the
 *      core SSSS promise (meaning over surface tokens) applied to linking.
 *
 * SAFE BY DEFAULT: prints a plan and writes nothing unless --write is given.
 *
 * Usage:
 *   ssss autolink [dir] [--write] [--semantic] [--model <id>]
 *                 [--max-per-target N] [--min-len N] [--index]
 *                 [--include-headings] [--concurrency N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── args ────────────────────────────────────────────────────────────────────
function parseArgs() {
  let a = process.argv.slice(2);
  if (a[0] === 'autolink') a = a.slice(1); // reached via the `ssss` dispatcher
  const o = {
    dir: process.cwd(), write: false, semantic: false,
    model: 'claude-haiku-4-5', maxPerTarget: 1, minLen: 3,
    index: false, includeHeadings: false, concurrency: 4
  };
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--write') o.write = true;
    else if (x === '--semantic') o.semantic = true;
    else if (x === '--index') o.index = true;
    else if (x === '--include-headings') o.includeHeadings = true;
    else if (x === '--model') o.model = a[++i];
    else if (x === '--max-per-target') o.maxPerTarget = parseInt(a[++i], 10);
    else if (x === '--min-len') o.minLen = parseInt(a[++i], 10);
    else if (x === '--concurrency') o.concurrency = parseInt(a[++i], 10);
    else if (!x.startsWith('--')) pos.push(x);
  }
  if (pos[0]) o.dir = path.resolve(pos[0]);
  return o;
}

// Common words we never auto-link even if they appear as a single-word title.
const STOPWORDS = new Set([
  'type', 'name', 'status', 'task', 'run', 'model', 'rule', 'page', 'event',
  'memory', 'skill', 'note', 'data', 'index', 'title', 'tags', 'the', 'and'
]);

// ─── vault walk + glossary ───────────────────────────────────────────────────
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

function splitFrontmatter(content) {
  if (!content.startsWith('---')) return { fm: '', body: content, hasFm: false };
  const end = content.indexOf('\n---', 3);
  if (end < 0) return { fm: '', body: content, hasFm: false };
  const fmEnd = content.indexOf('\n', end + 1);
  return {
    fm: content.slice(0, fmEnd + 1),
    body: content.slice(fmEnd + 1),
    hasFm: true
  };
}

/** Pull title / name / slug / aliases[] out of a YAML frontmatter block (no dep). */
function readMeta(fm) {
  const scalar = (k) => {
    const m = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  const meta = { title: scalar('title'), name: scalar('name'), slug: scalar('slug'), aliases: [] };
  // aliases: inline [a, b] or YAML block list
  const inline = fm.match(/^aliases:\s*\[(.*)\]\s*$/m);
  if (inline) meta.aliases = inline[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  else {
    const block = fm.match(/^aliases:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (block) meta.aliases = block[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return meta;
}

function buildGlossary(files, root) {
  const entries = [];
  for (const file of files) {
    const { fm } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm) continue;
    const meta = readMeta(fm);
    const target = '/' + path.relative(root, file).split(path.sep).join('/');
    const surfaces = new Set();
    for (const s of [meta.title, meta.name, ...meta.aliases]) {
      if (s && s.length >= 1) surfaces.add(s);
    }
    if (surfaces.size === 0) continue;
    entries.push({ file, target, surfaces: [...surfaces] });
  }
  return entries;
}

// ─── deterministic linking ───────────────────────────────────────────────────
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace term matches in a single plain-text chunk (no code/links inside). */
function linkChunk(chunk, regex, byForm, selfTarget, used, opts, stats) {
  return chunk.replace(regex, (m) => {
    const entry = byForm.get(m.toLowerCase());
    if (!entry || entry.target === selfTarget) return m;
    const count = used.get(entry.target) || 0;
    if (count >= opts.maxPerTarget) return m;
    used.set(entry.target, count + 1);
    stats.links++;
    return `[${m}](${entry.target})`;
  });
}

/** Link a line of body text, protecting inline code and existing links. */
function linkLine(line, regex, byForm, selfTarget, used, opts, stats) {
  // Split out protected spans: `inline code`, [text](url), [[wikilink]], <url>
  const protect = /(`[^`]*`|\[[^\]]*\]\([^)]*\)|\[\[[^\]]*\]\]|<[^>]+>|https?:\/\/\S+)/g;
  let out = '', last = 0, m;
  while ((m = protect.exec(line)) !== null) {
    out += linkChunk(line.slice(last, m.index), regex, byForm, selfTarget, used, opts, stats);
    out += m[0]; // protected span, untouched
    last = m.index + m[0].length;
  }
  out += linkChunk(line.slice(last), regex, byForm, selfTarget, used, opts, stats);
  return out;
}

function linkBody(body, glossary, selfTarget, opts, stats) {
  // Build a longest-first surface→entry map and one combined regex.
  const byForm = new Map();
  const forms = [];
  for (const e of glossary) {
    for (const s of e.surfaces) {
      const key = s.toLowerCase();
      const single = !/\s/.test(s);
      if (single && (s.length < opts.minLen || STOPWORDS.has(key))) continue;
      if (!byForm.has(key)) { byForm.set(key, e); forms.push(s); }
    }
  }
  if (forms.length === 0) return body;
  forms.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`\\b(${forms.map(esc).join('|')})\\b`, 'gi');

  // Seed the per-target budget from links already present so re-runs are
  // idempotent: a target that already has maxPerTarget links gets no more.
  const used = new Map();
  for (const m of body.matchAll(/\]\((\/[^)]+)\)/g)) {
    used.set(m[1], (used.get(m[1]) || 0) + 1);
  }

  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!opts.includeHeadings && /^#{1,6}\s/.test(t)) continue;
    lines[i] = linkLine(lines[i], regex, byForm, selfTarget, used, opts, stats);
  }
  return lines.join('\n');
}

// ─── semantic linking (Anthropic API, optional) ──────────────────────────────
async function semanticLinks(body, glossary, selfTarget, opts) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const items = glossary.filter(e => e.target !== selfTarget)
    .map(e => ({ path: e.target, names: e.surfaces.slice(0, 4) }));
  const sys = 'You insert wiki links into Markdown. You are given a glossary of concepts (each with a path and names) and a document body. Find places where the body references a glossary concept BY MEANING — including paraphrases and synonyms, not just exact name matches. Return ONLY a JSON array of {"path","anchor"} where "anchor" is an EXACT substring of the body to turn into a link to "path". Rules: never link inside code; never link the document to its own path; pick natural noun-phrase anchors; max one anchor per concept; prefer precision over recall. Return [] if nothing fits.';
  const user = `GLOSSARY:\n${JSON.stringify(items)}\n\nDOCUMENT BODY:\n${body.slice(0, 8000)}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: opts.model, max_tokens: 1024, system: sys, messages: [{ role: 'user', content: user }] })
    });
    if (!res.ok) { console.error(`   ⚠ semantic API ${res.status}: ${(await res.text()).slice(0, 120)}`); return []; }
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const out = JSON.parse(json);
    return Array.isArray(out) ? out.filter(x => x && x.path && x.anchor) : [];
  } catch (err) {
    console.error(`   ⚠ semantic link failed: ${err.message}`);
    return [];
  }
}

/** Apply semantic anchors as links to the first plain-text occurrence of each. */
function applySemantic(body, links, selfTarget, stats) {
  let inFence = false;
  const lines = body.split('\n');
  // Seed from existing links so a path already linked is not linked again (idempotent).
  const done = new Set();
  for (const m of body.matchAll(/\]\((\/[^)]+)\)/g)) done.add(m[1]);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const l of links) {
      if (done.has(l.path) || l.path === selfTarget) continue;
      const idx = lines[i].indexOf(l.anchor);
      if (idx < 0) continue;
      // Don't relink inside an existing link/code span on this line.
      const before = lines[i].slice(0, idx);
      if ((before.match(/`/g) || []).length % 2 === 1) continue;
      if (/\]\([^)]*$/.test(before) || /\[[^\]]*$/.test(before)) continue;
      lines[i] = before + `[${l.anchor}](${l.path})` + lines[i].slice(idx + l.anchor.length);
      done.add(l.path); stats.semantic++;
    }
  }
  return lines.join('\n');
}

// ─── index.md generation (spec §4.3) ─────────────────────────────────────────
/**
 * Generate one index.md per directory for progressive disclosure.
 *
 * Covers every ANCESTOR directory of every tracked file (not just directories
 * that directly contain a .md file) — a nested primitive like
 * `roles/admin/ROLE.md` needs `roles/admin/index.md` (listing ROLE.md) AND
 * `roles/index.md` (listing the `admin/` subdirectory) for the chain to be
 * navigable end to end. Subdirectories that themselves get an index are
 * listed as `[name/](./name/index.md)` entries alongside sibling files.
 */
export function generateIndexes(files, root, opts, summary) {
  const dirs = new Set();
  for (const f of files) {
    if (path.basename(f) === 'index.md') continue;
    // Stop before `root` itself: a bundle-relative path of bare "index.md"
    // (no leading directory) doesn't match the engine's `*/index.md` special
    // case and would fail normal frontmatter validation. Vault-root indexing
    // is intentionally out of scope here, matching prior behavior.
    let d = path.dirname(f);
    while (d !== root) {
      dirs.add(d);
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  }

  for (const dir of dirs) {
    const lines = [`# Index — ${path.relative(root, dir) || '.'}`, ''];
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (dirs.has(path.join(dir, e.name))) lines.push(`- [${e.name}/](./${e.name}/index.md)`);
      } else if (e.name.endsWith('.md') && e.name !== 'index.md') {
        const { fm } = splitFrontmatter(fs.readFileSync(path.join(dir, e.name), 'utf8'));
        const meta = readMeta(fm);
        const label = meta.title || meta.name || path.basename(e.name, '.md');
        lines.push(`- [${label}](./${e.name})`);
      }
    }
    const target = path.join(dir, 'index.md');
    summary.indexes.push(path.relative(root, target));
    if (opts.write) fs.writeFileSync(target, lines.join('\n') + '\n', 'utf8');
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
export async function main() {
  const opts = parseArgs();
  console.log(`\n=== ssss autolink ===`);
  console.log(`  dir:      ${opts.dir}`);
  console.log(`  mode:     ${opts.write ? 'WRITE' : 'dry-run (use --write to apply)'}${opts.semantic ? ' + semantic AI' : ''}\n`);

  const files = walk(opts.dir);
  if (files.length === 0) { console.log('No .md files found.'); return; }
  const glossary = buildGlossary(files, opts.dir);
  console.log(`  ${files.length} files scanned · ${glossary.length} linkable concepts in glossary`);
  if (opts.semantic && !process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠ --semantic given but ANTHROPIC_API_KEY is not set; running deterministic only.\n');
  }

  const summary = { changed: 0, links: 0, semantic: 0, indexes: [] };
  // Limit concurrency for the semantic API calls.
  const queue = [...files];
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      const original = fs.readFileSync(file, 'utf8');
      const { fm, body } = splitFrontmatter(original);
      const selfTarget = '/' + path.relative(opts.dir, file).split(path.sep).join('/');
      const stats = { links: 0, semantic: 0 };
      let newBody = linkBody(body, glossary, selfTarget, opts, stats);
      if (opts.semantic && process.env.ANTHROPIC_API_KEY) {
        const links = await semanticLinks(newBody, glossary, selfTarget, opts);
        if (links.length) newBody = applySemantic(newBody, links, selfTarget, stats);
      }
      if (stats.links + stats.semantic > 0) {
        summary.changed++; summary.links += stats.links; summary.semantic += stats.semantic;
        const rel = path.relative(opts.dir, file);
        console.log(`  ~ ${rel}  (+${stats.links} exact${stats.semantic ? `, +${stats.semantic} semantic` : ''})`);
        if (opts.write) fs.writeFileSync(file, fm + newBody, 'utf8');
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.semantic ? opts.concurrency : 1) }, worker));

  if (opts.index) generateIndexes(files, opts.dir, opts, summary);

  console.log(`\n  ${summary.changed} files ${opts.write ? 'updated' : 'would change'} · ${summary.links} exact + ${summary.semantic} semantic links` +
    (opts.index ? ` · ${summary.indexes.length} index.md` : ''));
  if (!opts.write && summary.changed > 0) console.log(`  Re-run with --write to apply.`);
}

// Only self-execute when run directly (`node scripts/autolink.mjs ...` or the
// `ssss.mjs` dispatcher explicitly calling `main()`), never as a side effect
// of another module importing `generateIndexes` for reuse.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
