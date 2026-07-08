#!/usr/bin/env node
/**
 * Build the canonical reference `.ucw` bundle (spec §16, Track G — "Festival in a
 * Box"). Writes conformance/reference-bundle.ucw.json deterministically so the
 * content hash is stable and the bundle is a fixed conformance artifact.
 *
 * The reference vault deliberately contains all three portability classes so the
 * exported `sale` bundle proves the keystone (§5.5):
 *   - structural     → INCLUDED  (the sellable festival model)
 *   - resource_bound → INCLUDED as a requirement declaration (buyer binds a domain)
 *   - tenant_private → DROPPED   (the operator's ticket records never ship)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportBundle, validateBundle } from '../src/bundle.mjs';
import { generateIndexes } from './autolink.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'conformance', 'reference-bundle.ucw.json');

// ─── The reference vault ────────────────────────────────────────────────────
const VAULT = {
  // structural — the festival's reusable model
  'workflows/box-office.md':
`---
type: workflow
title: Box Office
description: Ticket-sales workflow for a music festival.
timestamp: 2026-07-02T00:00:00Z
name: Box Office
slug: box-office
---
Sell tickets, then hand the buyer to [[concierge]] for questions.`,
  'assistants/concierge.md':
`---
type: assistant
title: Festival Concierge
description: Assistant that answers attendee questions about the lineup and venue.
timestamp: 2026-07-02T00:00:00Z
name: Festival Concierge
slug: concierge
---
Answer attendee questions about the lineup and venue.`,
  'pages/lineup.md':
`---
type: page
title: Lineup
description: Public-facing festival lineup page.
timestamp: 2026-07-02T00:00:00Z
slug: lineup
name: Lineup
sandbox_entry: lineup/index.html
---
The festival lineup page.`,
  'rules/refund-policy.md':
`---
type: rule
title: Refund Policy
description: Refund eligibility rule for festival attendees.
timestamp: 2026-07-02T00:00:00Z
name: Refund Policy
slug: refund-policy
---
Refunds are available up to 14 days before the event.`,
  'roles/admin/ROLE.md':
`---
type: security_role
title: Administrator Role
description: Security role with full festival operations write access.
timestamp: 2026-07-02T00:00:00Z
name: Administrator
permissions:
  - "write:assistant"
  - "write:workflow"
  - "write:rule"
  - "write:domain"
  - "write:page"
  - "write:security_role"
  - "write:task"
---
Full access to all festival operations.`,
  // resource_bound — declares "this business needs a domain"; the SELLER's domain never ships
  'domains/festival.md':
`---
type: domain
title: Festival Domain Requirement
description: Domain resource requirement that the buyer binds during provisioning.
timestamp: 2026-07-02T00:00:00Z
domain_name: REQUIREMENT
registrar: REQUIREMENT
status: required
payment_status: unbound
x_portability: resource_bound
---
This festival needs a domain. The buyer binds their own at provision (owns_domain).`,
  // tenant_private — operator's ticket record; MUST be dropped from a sale bundle
  'tasks/ticket-4821.md':
`---
type: task
title: Ticket 4821 Seat Change
description: Private support task for an attendee seat-change request.
timestamp: 2026-07-02T00:00:00Z
priority: high
category: support
status: pending
---
Attendee jane@example.com requested a seat change.`,
};

function buildVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-refvault-'));
  const files = [];

  for (const [rel, content] of Object.entries(VAULT)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    files.push(abs);
  }

  // Generate index.md for progressive disclosure (§4.3) — reuses the same
  // generator `ssss autolink --index` uses, so there is one implementation.
  generateIndexes(files, root, { write: true }, { indexes: [] });

  return root;
}

const vault = buildVault();
try {
  const bundle = exportBundle(vault, {
    profile: 'sale',
    name: 'Festival in a Box',
    description: 'A complete music-festival operation as a tradeable SSSS bundle.',
    version: '1.0.0',
    exporter: '@ssss/cli@0.7.0',
    requiredExtensions: ['festech'],
    parameters: [
      { key: 'business_name', label: 'Festival name', type: 'string', scope: 'workspace', source: 'user', required: true },
      { key: 'domain', label: 'Domain to bind', type: 'string', scope: 'workspace', source: 'user', required: true, description: 'Satisfies the resource_bound domain requirement (owns_domain).' },
      { key: 'support_mailbox', label: 'Support mailbox', type: 'string', scope: 'workspace', source: 'user', required: false },
    ],
    provisioning: [
      { id: 'ws', label: 'Create the workspace', system: 'workspace', mode: 'generate', required: true },
      { id: 'dom', label: 'Bind the festival domain', system: 'domains', mode: 'provision', required: true, notes: 'owns_domain — buyer supplies their own domain.' },
      { id: 'mail', label: 'Provision a support mailbox', system: 'email', mode: 'provision', required: false },
    ],
  });

  // Drop the internal export trace before persisting the artifact.
  const dropped = bundle._dropped;
  delete bundle._dropped;

  const { valid, errors } = validateBundle(bundle);
  if (!valid) {
    console.error('❌ Reference bundle failed validation:');
    for (const e of errors) console.error('   • ' + e);
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`✅ Wrote ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
  console.log(`   profile=sale  files=${bundle.files.length}  hash=${bundle.manifest.provenance.content_hash.slice(0, 23)}…`);
  console.log(`   inventory: ${JSON.stringify(bundle.manifest.primitive_inventory)}`);
  console.log(`   dropped (tenant_private, not sold): ${dropped.map((d) => `${d.path}[${d.portability}]`).join(', ') || '(none)'}`);
} finally {
  fs.rmSync(vault, { recursive: true, force: true });
}
