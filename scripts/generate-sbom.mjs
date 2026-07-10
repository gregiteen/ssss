#!/usr/bin/env node
/**
 * Generate a minimal SPDX-lite SBOM for @gregiteen/ssss-cli publish artifacts.
 * Dependency-free: packages only what is declared in package.json (zero runtime deps).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

const files = walk(root).filter(
  (f) =>
    !f.includes(`${path.sep}artifacts${path.sep}`) &&
    !f.endsWith('package-lock.json'),
);

const packages = [
  {
    name: pkg.name,
    version: pkg.version,
    downloadLocation: 'https://registry.npmjs.org/@gregiteen/ssss-cli/-/ssss-cli-0.9.0.tgz',
    filesAnalyzed: true,
    licenseConcluded: pkg.license || 'NOASSERTION',
  },
];

// Zero runtime dependencies by design — still list optional peer/dev if present
for (const [section, deps] of Object.entries({
  dependencies: pkg.dependencies || {},
  optionalDependencies: pkg.optionalDependencies || {},
})) {
  for (const [name, version] of Object.entries(deps)) {
    packages.push({
      name,
      version: String(version).replace(/^[\^~]/, ''),
      relationship: section,
    });
  }
}

const fileEntries = files.map((abs) => {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const buf = fs.readFileSync(abs);
  return {
    fileName: rel,
    checksums: [
      {
        algorithm: 'SHA256',
        checksumValue: crypto.createHash('sha256').update(buf).digest('hex'),
      },
    ],
  };
});

const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `${pkg.name}-${pkg.version}`,
  documentNamespace: `https://github.com/gregiteen/ssss/sbom/${pkg.version}`,
  creationInfo: {
    created: new Date().toISOString(),
    creators: ['Tool: ssss-generate-sbom'],
  },
  packages,
  files: fileEntries,
  relationships: [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: 'SPDXRef-Package',
    },
  ],
  comment:
    'SSSS reference package is intentionally dependency-free at runtime. Host apps supply adapters.',
};

const outDir = path.join(root, 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `sbom-${pkg.version}.spdx.json`);
fs.writeFileSync(outFile, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`SBOM written: ${outFile}`);
console.log(`Packages: ${packages.length}, files hashed: ${fileEntries.length}`);
