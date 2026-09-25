#!/usr/bin/env node
/**
 * Generate a minimal SPDX-lite SBOM for @gregiteen/ssss-cli publish artifacts.
 * Dependency-free: packages only what is declared in package.json (zero runtime deps).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Use npm's actual packlist so local brains, secrets, and unrelated checkout
// files cannot enter a published artifact or its SBOM.
const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
}));
const files = pack[0].files.map(({ path: packedPath }) => {
  const abs = path.resolve(root, packedPath);
  if (!abs.startsWith(root + path.sep) || !fs.statSync(abs).isFile()) {
    throw new Error(`Invalid packed file path: ${packedPath}`);
  }
  return abs;
});

const packages = [
  {
    name: pkg.name,
    version: pkg.version,
    downloadLocation: `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').pop()}-${pkg.version}.tgz`,
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
