/**
 * Deterministic semantic projection and non-destructive localization helpers
 * (spec §11.9). No database, network, embedding provider, or YAML dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument, serializeDocument } from './frontmatter.mjs';
import {
  documentHash,
  isSafeDocumentPath,
  loadRegistries,
  resolvePortability,
  validateDataConstraints,
  validateReferenceConstraints,
} from './registry.mjs';

const DEFAULT_LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const TRANSLATABLE_FIELDS = new Set(['title', 'description', 'body']);
const APPROVED_STATUSES = new Set(['approved']);

function asStrings(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item);
  return typeof value === 'string' && value ? [value] : [];
}

export function normalizeLocale(value, pattern = DEFAULT_LOCALE_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`Invalid locale '${value}'. Use a BCP47-style tag such as en, es-MX, or zh-Hant.`);
  }
  return value.split('-').map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
    if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    return part.toLowerCase();
  }).join('-');
}

function walkDocuments(vaultRoot) {
  const root = path.resolve(vaultRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Vault directory does not exist: ${root}`);
  }
  const documents = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing symlinked vault entry: ${relative}`);
      }
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md') &&
               entry.name !== 'index.md' && entry.name !== 'log.md') {
        if (!isSafeDocumentPath(relative)) throw new Error(`Unsafe vault path: ${relative}`);
        const content = fs.readFileSync(absolute, 'utf8');
        const parsed = parseDocument(content);
        if (!parsed.data.type) continue;
        documents.push({ path: relative, absolute, content, ...parsed });
      }
    }
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

function documentMap(documents) {
  return new Map(documents.map((document) => [document.path, document]));
}

function validateReferences(document, documents, types) {
  const definition = types.get(document.data.type);
  return validateReferenceConstraints(
    definition,
    document.data,
    (referencePath) => documents.get(referencePath) || null,
    types
  );
}

function translationMap(documents, locale, types, { includeDrafts = false } = {}) {
  const wanted = normalizeLocale(locale);
  const bySource = new Map();
  for (const document of documents.values()) {
    if (document.data.type !== 'translation') continue;
    const normalized = normalizeLocale(document.data.locale);
    if (normalized !== wanted) continue;
    if (!includeDrafts && !APPROVED_STATUSES.has(document.data.status)) continue;
    const key = document.data.source_path;
    if (bySource.has(key)) {
      throw new Error(
        `Duplicate translation overlays for '${key}' and locale '${wanted}': ` +
        `${bySource.get(key).path}, ${document.path}`
      );
    }
    const issues = validateReferences(document, documents, types);
    if (issues.length) {
      throw new Error(`${document.path}: ${issues.map((issue) => `${issue.field}: ${issue.issue}`).join('; ')}`);
    }
    bySource.set(key, document);
  }
  return bySource;
}

export function applyTranslationOverlay(sourceContent, translationContent, options = {}) {
  const { types, core } = loadRegistries(options.registryDir);
  const source = parseDocument(sourceContent);
  const overlay = parseDocument(translationContent);
  if (overlay.data.type !== 'translation') throw new Error('Overlay must declare type: translation.');
  if (source.data.type === 'translation') throw new Error('Translations may not target another translation.');
  const sourcePath = options.sourcePath || overlay.data.source_path;
  if (!isSafeDocumentPath(sourcePath) || overlay.data.source_path !== sourcePath) {
    throw new Error(`Translation source_path '${overlay.data.source_path}' does not match '${sourcePath}'.`);
  }
  if (resolvePortability(types.get(source.data.type), source.data) !== 'structural') {
    throw new Error('Translation overlays may target structural documents only.');
  }
  const expectedHash = documentHash(sourceContent);
  if (overlay.data.source_hash !== expectedHash) {
    throw new Error(`Stale translation for '${sourcePath}'; expected source_hash '${expectedHash}'.`);
  }
  const localePattern = new RegExp(core.semantic?.locale_pattern || DEFAULT_LOCALE_PATTERN.source, 'u');
  const locale = normalizeLocale(overlay.data.locale, localePattern);
  const translatedFields = [...new Set(asStrings(overlay.data.translated_fields))];
  if (!translatedFields.length) throw new Error('translated_fields must not be empty.');
  for (const field of translatedFields) {
    if (!TRANSLATABLE_FIELDS.has(field)) {
      throw new Error(`Field '${field}' is a symbolic control field and may not be translated.`);
    }
  }

  const data = { ...source.data };
  let body = source.body;
  if (translatedFields.includes('title')) {
    if (!overlay.data.translated_title) throw new Error('translated_title is required when translating title.');
    data.title = overlay.data.translated_title;
  }
  if (translatedFields.includes('description')) {
    if (!overlay.data.translated_description) {
      throw new Error('translated_description is required when translating description.');
    }
    data.description = overlay.data.translated_description;
  }
  if (translatedFields.includes('body')) {
    if (!overlay.body.trim()) throw new Error('Translation body must not be empty when translating body.');
    body = overlay.body;
  }
  data.locale = locale;
  data.translation_of = sourcePath;
  data.translation_source_hash = expectedHash;

  return {
    content: serializeDocument(data, body),
    data,
    body,
    locale,
    status: overlay.data.status,
    translated_fields: translatedFields,
  };
}

function tokenize(value) {
  const normalized = String(value || '').normalize('NFKC').toLocaleLowerCase();
  return [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) || [])].sort();
}

function extractEdges(documentPath, data, body) {
  const edges = [];
  for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    edges.push({ source: documentPath, relation: 'mentions', target: match[1].trim() });
  }
  for (const match of body.matchAll(/\[[^\]]*\]\((\/[^)]+\.md)\)/g)) {
    edges.push({ source: documentPath, relation: 'links_to', target: match[1].slice(1) });
  }
  for (const relation of Array.isArray(data.relations) ? data.relations : []) {
    if (relation && typeof relation === 'object' && relation.target) {
      edges.push({
        source: documentPath,
        relation: String(relation.relation || relation.type || 'related_to'),
        target: String(relation.target),
      });
    }
  }
  return edges;
}

function canonicalHash(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function localizedDocuments(vaultRoot, options = {}) {
  const { types, core } = loadRegistries(options.registryDir);
  const all = walkDocuments(vaultRoot);
  const documents = documentMap(all);
  for (const document of all) {
    const definition = types.get(document.data.type);
    if (!definition) throw new Error(`${document.path}: unknown type '${document.data.type}'.`);
    const issues = [
      ...validateDataConstraints(
        definition,
        document.data,
        core.universal_frontmatter?.required || ['type']
      ),
      ...(document.data.type === 'translation' ? [] : validateReferences(document, documents, types)),
    ];
    if (issues.length) {
      throw new Error(`${document.path}: ${issues.map((issue) => `${issue.field}: ${issue.issue}`).join('; ')}`);
    }
  }
  const overlays = options.locale
    ? translationMap(documents, options.locale, types, options)
    : new Map();
  const output = [];
  let excluded = 0;

  for (const source of all) {
    if (source.data.type === 'translation') continue;
    const portability = resolvePortability(types.get(source.data.type), source.data);
    if (!options.includePrivate && portability !== 'structural') {
      excluded++;
      continue;
    }
    const overlay = overlays.get(source.path);
    const localized = overlay
      ? applyTranslationOverlay(source.content, overlay.content, {
          sourcePath: source.path,
          registryDir: options.registryDir,
        })
      : { content: source.content, data: source.data, body: source.body, locale: source.data.locale || null };
    output.push({
      path: source.path,
      source,
      overlay: overlay || null,
      portability,
      ...localized,
    });
  }
  return { documents: output, excluded };
}

export function buildSemanticIndex(vaultRoot, options = {}) {
  const locale = options.locale ? normalizeLocale(options.locale) : null;
  const localized = localizedDocuments(vaultRoot, { ...options, locale });
  const records = [];
  const edges = [];

  for (const document of localized.documents) {
    const data = document.data;
    const identity = data.semantic_id || data.resource || `${data.type}:${document.path}`;
    const labels = [data.title, data.description, data.name, data.slug, ...asStrings(data.aliases)];
    const tags = asStrings(data.tags);
    const record = {
      semantic_id: identity,
      path: document.path,
      type: data.type,
      portability: document.portability,
      locale: document.locale || null,
      title: data.title || null,
      description: data.description || null,
      resource: data.resource || null,
      aliases: asStrings(data.aliases),
      tags,
      content_hash: documentHash(document.content),
      translation: document.overlay ? {
        path: document.overlay.path,
        status: document.overlay.data.status,
        source_hash: document.overlay.data.source_hash,
      } : null,
      search: {
        identity: tokenize([identity, data.resource, data.type, document.path].filter(Boolean).join(' ')),
        labels: tokenize(labels.filter(Boolean).join(' ')),
        tags: tokenize(tags.join(' ')),
        text: tokenize(`${data.description || ''}\n${document.body || ''}`),
      },
    };
    records.push(record);
    edges.push(...extractEdges(document.path, data, document.body));
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  edges.sort((a, b) =>
    a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation) || a.target.localeCompare(b.target)
  );
  const payload = {
    version: 1,
    locale,
    include_private: !!options.includePrivate,
    excluded_documents: localized.excluded,
    documents: records,
    edges,
  };
  return { ...payload, index_hash: canonicalHash(payload) };
}

export function searchSemanticIndex(index, query, options = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const allowedTypes = options.types ? new Set(options.types) : null;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const results = [];
  for (const document of index.documents || []) {
    if (allowedTypes && !allowedTypes.has(document.type)) continue;
    const buckets = [
      [document.search?.identity || [], 12],
      [document.search?.labels || [], 7],
      [document.search?.tags || [], 5],
      [document.search?.text || [], 1],
    ];
    let score = 0;
    const matched = new Set();
    for (const token of queryTokens) {
      for (const [values, weight] of buckets) {
        if (values.includes(token)) {
          score += weight;
          matched.add(token);
          break;
        }
      }
    }
    if (score > 0) results.push({ score, matched: [...matched].sort(), document });
  }
  return results
    .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
    .slice(0, limit);
}

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, target);
}

function resolvePhysicalTarget(value) {
  const requested = path.resolve(value);
  let cursor = requested;
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    suffix.unshift(path.basename(cursor));
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const physical = fs.realpathSync(cursor);
  return path.join(physical, ...suffix);
}

export function materializeLocale(vaultRoot, locale, outputDir, options = {}) {
  const sourceRoot = fs.realpathSync(path.resolve(vaultRoot));
  const targetRoot = resolvePhysicalTarget(outputDir);
  const normalizedLocale = normalizeLocale(locale);
  if (targetRoot === sourceRoot || targetRoot.startsWith(sourceRoot + path.sep)) {
    throw new Error('Localization output must be outside the source vault.');
  }
  if (fs.existsSync(targetRoot)) {
    const targetStat = fs.lstatSync(targetRoot);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error(`Localization output must be a real directory: ${targetRoot}`);
    }
    if (fs.readdirSync(targetRoot).length > 0) {
      throw new Error(`Localization output directory must be empty: ${targetRoot}`);
    }
  }
  const localized = localizedDocuments(sourceRoot, { ...options, locale: normalizedLocale });
  const parent = path.dirname(targetRoot);
  fs.mkdirSync(parent, { recursive: true });
  const stageRoot = path.join(parent, `.${path.basename(targetRoot)}.${crypto.randomUUID()}.stage`);
  const inventory = [];
  let targetWasEmpty = fs.existsSync(targetRoot);
  try {
    fs.mkdirSync(stageRoot);
    for (const document of localized.documents) {
      if (!isSafeDocumentPath(document.path)) throw new Error(`Unsafe projection path: ${document.path}`);
      const target = path.resolve(stageRoot, document.path);
      if (!target.startsWith(stageRoot + path.sep)) throw new Error(`Projection path escaped output: ${document.path}`);
      atomicWrite(target, document.content);
      inventory.push({ path: document.path, content_hash: documentHash(document.content) });
    }
    inventory.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = {
      type: 'ssss_localization_projection',
      version: 1,
      locale: normalizedLocale,
      include_private: !!options.includePrivate,
      document_count: inventory.length,
      excluded_documents: localized.excluded,
      source_hash: canonicalHash(inventory),
      documents: inventory,
    };
    atomicWrite(path.join(stageRoot, '.ssss-projection.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (targetWasEmpty) fs.rmdirSync(targetRoot);
    fs.renameSync(stageRoot, targetRoot);
    return manifest;
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    if (targetWasEmpty && !fs.existsSync(targetRoot)) fs.mkdirSync(targetRoot);
    throw error;
  }
}
