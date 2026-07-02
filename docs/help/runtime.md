# Workflow runtime (spec §11.8)

SSSS workflows are runtime definitions, not cron jobs stored somewhere else. The
canonical schedule lives in the `workflow` primitive's `triggers[]` frontmatter.
Cron, systemd, serverless schedules, webhooks, browser alarms, and queue workers
are wake-up mechanisms.

## Canonical loop

```
workflow trigger
  -> workflow_triggered event envelope
  -> task operation envelope
  -> task lease / worker claim
  -> run operation or append
  -> task status patch
  -> projection rebuild
```

Every mutation goes through the Operation Contract. A daemon MUST NOT write vault
files directly.

## Trigger source of truth

```yaml
---
type: workflow
name: "Daily Digest"
triggers:
  - type: cron
    id: daily-0800
    cron: "0 8 * * *"
    timezone: "America/Denver"
    misfire_policy: run_once
    concurrency: skip_if_running
isActive: true
---
```

Supported trigger types are `manual`, `cron`, `interval`, `event`, `webhook`,
`file_change`, and `condition`.

## Idempotency

Runtime-created work uses this dedupe basis:

```text
workspace_id + workflow_id + trigger_id + scheduled_for
```

Two daemon ticks for the same scheduled instant MUST produce the same task
idempotency key. This is how SSSS avoids duplicate tasks without making a scheduler
database canonical.

## Reference helpers

Use `@ssss/cli/runtime` when building a host daemon:

```js
import { createEngine } from '@ssss/cli/engine';
import { planWorkflowTrigger } from '@ssss/cli/runtime';

const plan = planWorkflowTrigger({
  workflowPath: 'workflows/daily-digest/WORKFLOW.md',
  workflowContent,
  workspaceId: 'ws-1',
  trigger: { type: 'cron', id: 'daily-0800', cron: '0 8 * * *' },
  scheduledFor: '2026-07-02T14:00:00.000Z',
});

const engine = createEngine();
for (const envelope of plan.envelopes) {
  engine.processOperation(envelope, './vault');
}
```

`ssss conformance --engine` includes runtime checks that prove deterministic task
planning, idempotent duplicate ticks, and run creation through the reference engine.
