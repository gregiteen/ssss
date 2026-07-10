/**
 * Semantic projection, multilingual embedding, retrieval, and runtime rendering.
 * Canonical documents remain authored once; translations are never stored here.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from './frontmatter.mjs';
import { createValidator } from './validator.mjs';
import { isSafeDocumentPath, resolvePortability, resolvePrimitiveDefinition, documentHash } from './registry.mjs';

const LANGUAGE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const RENDER_FIELDS = new Set(['title', 'description', 'body']);

function asStrings(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item);
  return typeof value === 'string' && value ? [value] : [];
}

export function normalizeLanguage(value) {
  if (typeof value !== 'string' || !LANGUAGE_RE.test(value)) throw new Error(`Invalid language tag '${value}'.`);
  return value.split('-').map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
    if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    return part.toLowerCase();
  }).join('-');
}

function tokenize(value) {
  return [...new Set(String(value || '').normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].sort();
}

function walkDocuments(vaultRoot) {
  const root = fs.realpathSync(path.resolve(vaultRoot));
  const documents = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlinked vault entry: ${relative}`);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md' && entry.name !== 'log.md') {
        if (!isSafeDocumentPath(relative)) throw new Error(`Unsafe vault path: ${relative}`);
        const content = fs.readFileSync(absolute, 'utf8');
        const parsed = parseDocument(content);
        if (parsed.data.type) documents.push({ path: relative, content, ...parsed });
      }
    }
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

function extractEdges(documentPath, data, body) {
  const edges = [];
  for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) edges.push({ source: documentPath, relation: 'mentions', target: match[1].trim() });
  for (const match of body.matchAll(/\[[^\]]*\]\((\/[^)]+\.md)\)/g)) edges.push({ source: documentPath, relation: 'links_to', target: match[1].slice(1) });
  for (const relation of Array.isArray(data.relations) ? data.relations : []) {
    if (relation && typeof relation === 'object' && relation.target) {
      edges.push({ source: documentPath, relation: String(relation.relation || relation.type || 'related_to'), target: String(relation.target) });
    }
  }
  return edges;
}

function canonicalHash(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function semanticText(record) {
  return [record.title, record.description, record.surface?.body, record.aliases?.join(' '), record.tags?.join(' ')].filter(Boolean).join('\n');
}

export function buildSemanticIndex(vaultRoot, options = {}) {
  const validator = options.validator || createValidator(options);
  const records = [];
  const edges = [];
  let excluded = 0;
  for (const document of walkDocuments(vaultRoot)) {
    const validation = validator.validateDocument(document.content);
    if (!validation.valid) throw new Error(`${document.path}: ${validation.errors.join('; ')}`);
    const definition = resolvePrimitiveDefinition(validator.registry, validation.declared_type);
    const portability = resolvePortability(definition, document.data);
    if (!options.includePrivate && portability !== 'structural') { excluded++; continue; }
    const identity = document.data.semantic_id || document.data.resource || `${definition.qualified_type}:${document.path}`;
    const labels = [document.data.title, document.data.description, document.data.name, document.data.slug, ...asStrings(document.data.aliases)];
    const tags = asStrings(document.data.tags);
    const record = {
      semantic_id: identity,
      path: document.path,
      type: definition.qualified_type,
      primitive_version: definition.primitive_version || 1,
      portability,
      authored_language: document.data.language || document.data.locale || null,
      title: document.data.title || null,
      description: document.data.description || null,
      resource: document.data.resource || null,
      aliases: asStrings(document.data.aliases),
      tags,
      relations: Array.isArray(document.data.relations) ? document.data.relations : [],
      content_hash: documentHash(document.content),
      surface: { title: document.data.title || null, description: document.data.description || null, body: document.body || '' },
      search: {
        identity: tokenize([identity, document.data.resource, definition.qualified_type, document.path].filter(Boolean).join(' ')),
        labels: tokenize(labels.filter(Boolean).join(' ')),
        tags: tokenize(tags.join(' ')),
        text: tokenize(`${document.data.description || ''}\n${document.body || ''}`),
      },
    };
    records.push(record);
    edges.push(...extractEdges(document.path, document.data, document.body));
  }
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation) || a.target.localeCompare(b.target));
  const payload = { version: 2, include_private: !!options.includePrivate, excluded_documents: excluded, embedding: null, documents: records, edges };
  return { ...payload, index_hash: canonicalHash(payload) };
}

function validateVectors(vectors, expectedLength) {
  if (!Array.isArray(vectors) || vectors.length !== expectedLength) throw new Error(`Embedding adapter returned ${vectors?.length || 0} vectors; expected ${expectedLength}.`);
  const dimension = vectors[0]?.length;
  if (!Number.isInteger(dimension) || dimension < 1) throw new Error('Embedding vectors must be non-empty arrays.');
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== dimension || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('Embedding vectors must have one finite numeric dimension.');
    }
  }
  return dimension;
}

export async function enrichSemanticIndex(index, { embed, model }) {
  if (typeof embed !== 'function') throw new Error('A multilingual embed(texts, context) adapter is required.');
  if (typeof model !== 'string' || !model) throw new Error('Embedding model identity is required.');
  const vectors = await embed(index.documents.map(semanticText), { model, purpose: 'document' });
  const dimension = validateVectors(vectors, index.documents.length);
  const documents = index.documents.map((record, indexNumber) => ({ ...record, embedding: vectors[indexNumber] }));
  const payload = { ...index, embedding: { model, dimension, multilingual: true }, documents };
  delete payload.index_hash;
  return { ...payload, index_hash: canonicalHash(payload) };
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index++) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

export function searchSemanticIndex(index, query, options = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const allowedTypes = options.types ? new Set(options.types) : null;
  const results = [];
  for (const document of index.documents || []) {
    if (allowedTypes && !allowedTypes.has(document.type)) continue;
    const buckets = [[document.search?.identity || [], 12], [document.search?.labels || [], 7], [document.search?.tags || [], 5], [document.search?.text || [], 1]];
    let lexical = 0;
    const matched = new Set();
    for (const token of tokens) for (const [values, weight] of buckets) if (values.includes(token)) { lexical += weight; matched.add(token); break; }
    const semantic = options.queryVector && document.embedding ? cosine(options.queryVector, document.embedding) : 0;
    if (lexical > 0 || semantic > 0) {
      results.push({ score: lexical + Math.max(0, semantic) * 20, evidence: { lexical, semantic, matched: [...matched].sort() }, document });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path)).slice(0, limit);
}

export async function searchSemanticIndexWithAdapter(index, query, { embed, model = index.embedding?.model, ...options }) {
  if (!index.embedding) throw new Error('Semantic index has no embeddings; enrich it first.');
  if (model !== index.embedding.model) throw new Error(`Embedding model mismatch: index uses '${index.embedding.model}', query requested '${model}'.`);
  const vectors = await embed([query], { model, purpose: 'query' });
  validateVectors(vectors, 1);
  if (vectors[0].length !== index.embedding.dimension) throw new Error('Query embedding dimension does not match the index.');
  return searchSemanticIndex(index, query, { ...options, queryVector: vectors[0] });
}

export function prepareRenderRequest(record, options = {}) {
  const language = normalizeLanguage(options.language);
  return {
    target_language: language,
    instruction: 'Render only the natural-language presentation fields in target_language. Never alter invariant controls or invent authority.',
    invariant: {
      semantic_id: record.semantic_id,
      path: record.path,
      type: record.type,
      primitive_version: record.primitive_version,
      resource: record.resource,
      portability: record.portability,
      tags: record.tags,
      relations: record.relations,
      content_hash: record.content_hash,
      available_actions: options.availableActions || [],
    },
    surface: { ...record.surface },
    context: options.context || null,
  };
}

export async function renderSemanticRecord(record, { language, render, ...options }) {
  if (typeof render !== 'function') throw new Error('An LLM render(request) adapter is required.');
  const request = prepareRenderRequest(record, { ...options, language });
  const rendered = await render(request);
  if (!rendered || typeof rendered !== 'object' || Array.isArray(rendered)) throw new Error('Render adapter must return an object.');
  for (const key of Object.keys(rendered)) if (!RENDER_FIELDS.has(key)) throw new Error(`Render adapter returned forbidden field '${key}'.`);
  for (const [key, value] of Object.entries(rendered)) if (typeof value !== 'string') throw new Error(`Rendered field '${key}' must be a string.`);
  return { record, presentation: { language: request.target_language, ...rendered }, invariant: request.invariant };
}
