#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FALLBACK_UNIVERSAL = ['type', 'title', 'description', 'timestamp'];
const FALLBACK_REQUIRED = {
  memory: ['slug', 'category', 'status', 'schema_version'],
  skill: ['name'],
  rule: ['name'],
  security_role: ['name', 'permissions'],
  task: ['priority', 'category', 'status'],
  assistant: ['name'],
  workflow: ['name'],
  model: ['model_id', 'provider'],
  conversation: ['thread_id'],
  run: ['run_id', 'workflow_id'],
  conflict: ['conflict_id', 'status', 'new_slug', 'existing_slug', 'detected_at'],
  page: ['slug', 'name', 'sandbox_entry'],
  migration: ['migration_id', 'from_version', 'to_version', 'status'],
  release: ['release_id', 'version', 'schema_version', 'summary', 'released_at'],
  translation: ['translation_id', 'source_path', 'source_hash', 'locale', 'status', 'translated_fields'],
};
const CONTRACT_TYPES = new Set(['operation', 'patch', 'event', 'delete', 'lease']);
const APPEND_TYPES = new Set(['conversation', 'run']);

function findUp(start, predicate) {
  let dir = path.resolve(start);
  while (true) {
    if (predicate(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findKernelRoot(start) {
  return findUp(start, (dir) =>
    fs.existsSync(path.join(dir, 'registry', 'core.json')) &&
    fs.existsSync(path.join(dir, 'src', 'frontmatter.mjs'))
  );
}

function parseScalar(value) {
  const text = value.trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map((item) => parseScalar(item)).filter((item) => item !== '');
  }
  return text;
}

function parseFallback(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') throw new Error('Missing YAML frontmatter block.');
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (close < 0) throw new Error('Unclosed YAML frontmatter block.');
  const data = {};
  let collectionKey = null;
  for (const line of lines.slice(1, close)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && collectionKey) {
      if (!Array.isArray(data[collectionKey])) data[collectionKey] = [];
      data[collectionKey].push(parseScalar(listMatch[1]));
      continue;
    }
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    collectionKey = match[1];
    data[collectionKey] = parseScalar(match[2]);
  }
  return { data, body: lines.slice(close + 1).join('\n') };
}

async function parseDocument(raw, kernelRoot) {
  if (!kernelRoot) return parseFallback(raw);
  try {
    const module = await import(pathToFileURL(path.join(kernelRoot, 'src', 'frontmatter.mjs')).href);
    return module.parseDocument(raw);
  } catch {
    return parseFallback(raw);
  }
}

function loadRegistry(kernelRoot) {
  if (!kernelRoot) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(kernelRoot, 'registry', 'core.json'), 'utf8'));
  } catch {
    return null;
  }
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

function requiredWhenFields(definition, data) {
  const fields = [];
  for (const [condition, required] of Object.entries(definition?.required_when || {})) {
    const match = condition.match(/^([A-Za-z_][A-Za-z0-9_-]*)==(.+)$/);
    if (match && String(data[match[1]]) === match[2]) fields.push(...required);
  }
  return fields;
}

function isSafeReferencePath(value) {
  return typeof value === 'string' && value.length > 0 && value.endsWith('.md') &&
    !path.isAbsolute(value) && !value.includes('\\') && !value.includes('\0') &&
    value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function inferVaultRoot(target) {
  let cursor = path.dirname(target);
  while (path.dirname(cursor) !== cursor) {
    if (path.basename(cursor) === 'translations') return path.dirname(cursor);
    cursor = path.dirname(cursor);
  }
  return null;
}

async function validateTranslationReference(target, data, registry, kernelRoot, errors, warnings) {
  if (data.type !== 'translation' || isEmpty(data.source_path)) return;
  if (!isSafeReferencePath(data.source_path)) {
    errors.push(`Field 'source_path' must be a safe vault-relative Markdown path.`);
    return;
  }
  const vaultRoot = inferVaultRoot(target);
  if (!vaultRoot) {
    warnings.push("Cannot resolve translation source outside the canonical translations/<locale>/ layout.");
    return;
  }
  const source = path.resolve(vaultRoot, data.source_path);
  const relative = path.relative(vaultRoot, source);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push("Translation source_path escapes the vault.");
    return;
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) {
    errors.push(`Translation source does not exist as a regular non-symlinked file: ${data.source_path}.`);
    return;
  }
  const raw = fs.readFileSync(source, 'utf8');
  const parsed = await parseDocument(raw, kernelRoot);
  if (parsed.data.type === 'translation') errors.push('Translations may not target another translation.');
  const sourceDefinition = registry?.document_primitives?.[parsed.data.type];
  const portability = parsed.data.x_portability || sourceDefinition?.portability;
  if (portability !== 'structural') errors.push('Translations may target structural documents only.');
  const hash = `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;
  if (data.source_hash !== hash) errors.push(`Translation source_hash is stale; expected '${hash}'.`);
}

export async function validateNode(filePath) {
  const target = path.resolve(filePath);
  const kernelRoot = findKernelRoot(path.dirname(target)) || findKernelRoot(process.cwd());
  const registry = loadRegistry(kernelRoot);
  const raw = fs.readFileSync(target, 'utf8');
  const { data, body } = await parseDocument(raw, kernelRoot);
  const errors = [];
  const warnings = [];

  if (isEmpty(data.type)) {
    errors.push("Missing required field 'type'.");
    return { valid: false, errors, warnings, file: target, type: null, kernelRoot };
  }
  if (CONTRACT_TYPES.has(data.type)) {
    errors.push(`Type '${data.type}' is a contract envelope, not a Markdown document primitive.`);
  }

  const definition = registry?.document_primitives?.[data.type] || null;
  if (registry && !definition) errors.push(`Unknown document primitive '${data.type}'.`);
  if (!registry && !FALLBACK_REQUIRED[data.type]) {
    warnings.push(`No live core registry found and no fallback schema exists for '${data.type}'.`);
  }

  const required = new Set([
    ...(registry?.universal_frontmatter?.required || FALLBACK_UNIVERSAL),
    ...(definition?.required_fields || FALLBACK_REQUIRED[data.type] || []),
    ...requiredWhenFields(definition, data),
  ]);
  for (const field of required) {
    if (isEmpty(data[field])) errors.push(`Missing required field '${field}'.`);
  }

  for (const [field, allowed] of Object.entries(definition?.enums || {})) {
    const values = Array.isArray(data[field]) ? data[field] : [data[field]];
    if (!isEmpty(data[field]) && values.some((value) => !allowed.includes(value))) {
      errors.push(`Field '${field}' must contain only: ${allowed.join(', ')}.`);
    }
  }

  for (const [field, source] of Object.entries(definition?.patterns || {})) {
    if (isEmpty(data[field])) continue;
    try {
      if (!(new RegExp(source, 'u')).test(String(data[field]))) {
        errors.push(`Field '${field}' does not match required pattern ${source}.`);
      }
    } catch {
      errors.push(`Registry pattern for '${field}' is invalid.`);
    }
  }

  await validateTranslationReference(target, data, registry, kernelRoot, errors, warnings);

  if (APPEND_TYPES.has(data.type) && body.trim() === '') {
    warnings.push(`Append-only primitive '${data.type}' has an empty body.`);
  }
  if (data.type === 'memory' && target.split(path.sep).includes('memory-vault')) {
    const parent = path.basename(path.dirname(target));
    if (data.category && data.category !== parent) {
      errors.push(`Memory category '${data.category}' does not match parent directory '${parent}'.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    file: target,
    type: data.type,
    kernelRoot,
  };
}

function realpath(value) {
  try { return fs.realpathSync(value); } catch { return value; }
}

const invoked = process.argv[1] ? realpath(path.resolve(process.argv[1])) : null;
if (invoked === realpath(fileURLToPath(import.meta.url))) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node validate-schema.mjs <path-to-ssss-document.md>');
    process.exit(2);
  }
  try {
    const result = await validateNode(target);
    for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
    if (!result.valid) {
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      process.exit(1);
    }
    console.log(`OK: ${path.basename(result.file)} is a valid '${result.type}' document.`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
