#!/usr/bin/env node
/**
 * Builds the adversarial Stage 5.5 (RBAC) envelope matrix.
 *
 * Each "scenario" is an ordered list of steps run against ONE shared temp
 * vault (some scenarios need a setup step — e.g. create a limited role —
 * before the actual probe). Every step carries an `expectedAllowed` so
 * probe-rbac.mjs can classify results without guessing.
 *
 * Exports `buildScenarios()` for reuse by probe-rbac.mjs. Also runnable
 * standalone to dump the matrix as JSON for inspection.
 */
import crypto from 'node:crypto';

const WORKSPACE_ID = 'RBAC_AUDIT_WORKSPACE';

function uuid() { return crypto.randomUUID(); }

function assistantContent(name) {
  return `---\ntype: assistant\nname: "${name}"\n---\n\nProbe assistant.`;
}

function roleContent(name, permissions) {
  const perms = permissions.map((p) => `  - "${p}"`).join('\n');
  return `---\ntype: security_role\nname: "${name}"\npermissions:\n${perms}\n---\n\nProbe role.`;
}

export function buildScenarios() {
  return [
    {
      name: 'missing-actor-denied',
      category: 'fail-closed-expected',
      note: 'An otherwise-valid write with NO actor field must be denied, not admin-promoted (the historical bug).',
      steps: [
        {
          label: 'create assistant with no actor field',
          expectedAllowed: false,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'assistants/missing-actor-probe/ASSISTANT.md',
            content: assistantContent('Missing Actor Probe'),
          },
        },
      ],
    },
    {
      name: 'unknown-role-denied',
      category: 'fail-closed-expected',
      note: 'A role name with no roles/<role>/ROLE.md on disk and no hardcoded permissions must be denied.',
      steps: [
        {
          label: 'create assistant as a role that does not exist',
          expectedAllowed: false,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'assistants/unknown-role-probe/ASSISTANT.md',
            content: assistantContent('Unknown Role Probe'),
            actor: { role: 'totally-made-up-role-xyz' },
          },
        },
      ],
    },
    {
      name: 'system-role-bypass-intentional',
      category: 'sanity-allowed',
      note: 'system role is an INTENTIONAL unconditional bypass. This must stay allowed — do not flag it.',
      steps: [
        {
          label: 'create assistant as system',
          expectedAllowed: true,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'assistants/system-probe/ASSISTANT.md',
            content: assistantContent('System Probe'),
            actor: { role: 'system' },
          },
        },
      ],
    },
    {
      name: 'admin-role-hardcoded-intentional',
      category: 'sanity-allowed',
      note: 'admin gets hardcoded write:*/read:* regardless of ROLE.md content. This is INTENTIONAL — do not flag it.',
      steps: [
        {
          label: 'create assistant as admin (no roles/admin/ROLE.md exists in this vault)',
          expectedAllowed: true,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'assistants/admin-probe/ASSISTANT.md',
            content: assistantContent('Admin Probe'),
            actor: { role: 'admin' },
          },
        },
      ],
    },
    {
      name: 'read-only-role-write-denied',
      category: 'fail-closed-expected',
      note: 'A role with only read:* must be denied on a write.',
      steps: [
        {
          label: 'create the read-only role (as system)',
          expectedAllowed: true,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'roles/audit-reader/ROLE.md',
            content: roleContent('audit-reader', ['read:*']),
            actor: { role: 'system' },
          },
        },
        {
          label: 'attempt to write an assistant as the read-only role',
          expectedAllowed: false,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'assistants/read-only-probe/ASSISTANT.md',
            content: assistantContent('Read Only Probe'),
            actor: { role: 'audit-reader' },
          },
        },
      ],
    },
    {
      name: 'event-write-event-permission-allowed',
      category: 'sanity-allowed',
      note: 'A role holding exactly write:event may write an event. Proves event envelopes resolve a real, satisfiable permission.',
      steps: [
        {
          label: 'create the write:event-only role (as system)',
          expectedAllowed: true,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'roles/audit-reporter/ROLE.md',
            content: roleContent('audit-reporter', ['write:event']),
            actor: { role: 'system' },
          },
        },
        {
          label: 'write an event as the write:event-scoped role',
          expectedAllowed: true,
          envelope: {
            type: 'event', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'events/audit-probe',
            content: JSON.stringify({ event_type: 'audit_probe' }),
            actor: { role: 'audit-reporter' },
          },
        },
      ],
    },
    {
      name: 'event-wrong-type-permission-denied',
      category: 'fail-closed-expected',
      note: 'A role holding write:<some other type> but NOT write:event must be denied on an event write — proves it is not falling through to an unsatisfiable write:null OR an over-broad match.',
      steps: [
        {
          label: 'create a role scoped to a different type only (as system)',
          expectedAllowed: true,
          envelope: {
            type: 'operation', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'roles/audit-assistant-writer/ROLE.md',
            content: roleContent('audit-assistant-writer', ['write:assistant']),
            actor: { role: 'system' },
          },
        },
        {
          label: 'attempt an event write as the assistant-scoped role',
          expectedAllowed: false,
          envelope: {
            type: 'event', idempotency_key: uuid(), workspace_id: WORKSPACE_ID,
            path: 'events/should-be-denied-probe',
            content: JSON.stringify({ event_type: 'should_not_land' }),
            actor: { role: 'audit-assistant-writer' },
          },
        },
      ],
    },
  ];
}

function main() {
  console.log(JSON.stringify(buildScenarios(), null, 2));
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
