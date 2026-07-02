/**
 * SSSS workflow runtime helpers.
 *
 * This is not a resident daemon. It is the deterministic planning layer a daemon,
 * cron bridge, webhook worker, or agent host uses to turn a workflow trigger into
 * Operation Contract envelopes. The vault remains the source of truth; scheduler
 * queues and dashboards are projections.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { parseDocument } from './frontmatter.mjs';

export const RUNTIME_TRIGGER_TYPES = ['manual', 'cron', 'interval', 'event', 'webhook', 'file_change', 'condition'];
export const RUNTIME_MISFIRE_POLICIES = ['skip', 'run_once', 'catch_up'];
export const RUNTIME_CONCURRENCY_POLICIES = ['allow_parallel', 'skip_if_running', 'enqueue', 'replace'];
export const RUN_STATUSES = ['queued', 'claimed', 'running', 'waiting_for_human', 'succeeded', 'failed', 'canceled', 'retrying', 'dead_letter'];

function hash(input, length = 32) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, length);
}

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow';
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function iso(value, field) {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} must be an ISO-parseable timestamp.`);
  return d.toISOString();
}

function compactTimestamp(value) {
  return value.replace(/[^0-9TZ]/g, '').replace(/T.*Z$/, (s) => s.replace(/[^0-9TZ]/g, ''));
}

export function workflowIdFromPath(workflowPath, data = {}) {
  if (data.workflow_id) return slugify(data.workflow_id);
  if (data.slug) return slugify(data.slug);
  const base = path.basename(workflowPath || '', '.md');
  if (base && base !== 'WORKFLOW') return slugify(base);
  const parent = path.basename(path.dirname(workflowPath || ''));
  return slugify(parent || data.name || 'workflow');
}

export function normalizeRuntimeTrigger(trigger = {}) {
  if (!trigger || typeof trigger !== 'object') throw new Error('Runtime trigger must be an object.');
  const type = trigger.type || 'manual';
  if (!RUNTIME_TRIGGER_TYPES.includes(type)) {
    throw new Error(`Unknown runtime trigger type '${type}'. Must be one of: ${RUNTIME_TRIGGER_TYPES.join(', ')}.`);
  }
  const discriminator =
    trigger.trigger_id || trigger.id || trigger.name || trigger.cron || trigger.interval ||
    trigger.event_type || trigger.webhook_id || trigger.path || trigger.condition || type;
  return {
    ...trigger,
    type,
    trigger_id: slugify(discriminator),
    misfire_policy: trigger.misfire_policy || 'run_once',
    concurrency: trigger.concurrency || 'skip_if_running',
  };
}

export function planWorkflowTrigger({
  workflowPath,
  workflowContent,
  workspaceId,
  trigger = { type: 'manual' },
  scheduledFor,
  firedAt = scheduledFor || new Date().toISOString(),
  payload = {},
  actor = { role: 'system' },
} = {}) {
  if (!workflowPath) throw new Error('workflowPath is required.');
  if (!workflowContent) throw new Error('workflowContent is required.');
  if (!workspaceId) throw new Error('workspaceId is required.');

  const { data, body } = parseDocument(workflowContent);
  if (data.type !== 'workflow') throw new Error(`Expected type: workflow at ${workflowPath}.`);
  if (!data.name) throw new Error(`Workflow ${workflowPath} is missing required field 'name'.`);

  const normalizedTrigger = normalizeRuntimeTrigger(trigger);
  const workflow_id = workflowIdFromPath(workflowPath, data);
  const scheduled_for = iso(scheduledFor || firedAt, 'scheduledFor');
  const fired_at = iso(firedAt || scheduled_for, 'firedAt');
  const basis = `${workspaceId}:${workflow_id}:${normalizedTrigger.trigger_id}:${scheduled_for}`;
  const dedupe_key = `runtime:${hash(basis, 40)}`;
  const stamp = compactTimestamp(scheduled_for);
  const taskPath = `tasks/${workflow_id}/${normalizedTrigger.trigger_id}-${stamp}.md`;
  const eventPath = `events/workflows/${workflow_id}/${normalizedTrigger.trigger_id}-${stamp}`;

  const eventPayload = {
    event_type: 'workflow_triggered',
    workflow_id,
    workflow_path: workflowPath,
    trigger_id: normalizedTrigger.trigger_id,
    trigger_type: normalizedTrigger.type,
    scheduled_for,
    fired_at,
    dedupe_key,
    payload,
  };

  const taskContent = [
    '---',
    'type: task',
    `title: ${yamlString(`Task: ${data.name}`)}`,
    `description: ${yamlString(`Instantiated from ${workflowPath} by ${normalizedTrigger.type} trigger ${normalizedTrigger.trigger_id}.`)}`,
    `timestamp: ${yamlString(fired_at)}`,
    `priority: ${Number.isInteger(data.priority) ? data.priority : 50}`,
    'category: workflow',
    'status: pending',
    `workflow_id: ${yamlString(workflow_id)}`,
    `workflow_path: ${yamlString(workflowPath)}`,
    `trigger_id: ${yamlString(normalizedTrigger.trigger_id)}`,
    `trigger_type: ${yamlString(normalizedTrigger.type)}`,
    `scheduled_for: ${yamlString(scheduled_for)}`,
    `dedupe_key: ${yamlString(dedupe_key)}`,
    '---',
    '',
    `# Task: ${data.name}`,
    '',
    `Instantiated from ${workflowPath} by ${normalizedTrigger.type} trigger ${normalizedTrigger.trigger_id}.`,
    '',
    '## Workflow Steps',
    '',
    body.trim() || '_No workflow body provided._',
    '',
  ].join('\n');

  return {
    workflow_id,
    trigger_id: normalizedTrigger.trigger_id,
    scheduled_for,
    dedupe_key,
    envelopes: [
      {
        type: 'event',
        idempotency_key: `runtime-event-${hash(`event:${basis}`, 32)}`,
        path: eventPath,
        workspace_id: workspaceId,
        content: JSON.stringify(eventPayload),
        intent: 'Runtime trigger event',
        actor,
      },
      {
        type: 'operation',
        idempotency_key: `runtime-task-${hash(`task:${basis}`, 32)}`,
        path: taskPath,
        workspace_id: workspaceId,
        content: taskContent,
        intent: 'Runtime task instantiated from workflow trigger',
        actor,
      },
    ],
  };
}

export function createRunEnvelope({
  workflowId,
  workspaceId,
  taskPath,
  runId,
  taskId = taskPath,
  status = 'queued',
  startedAt = new Date().toISOString(),
  actor = { role: 'system' },
} = {}) {
  if (!workflowId) throw new Error('workflowId is required.');
  if (!workspaceId) throw new Error('workspaceId is required.');
  if (!taskPath) throw new Error('taskPath is required.');
  if (!RUN_STATUSES.includes(status)) {
    throw new Error(`Unknown run status '${status}'. Must be one of: ${RUN_STATUSES.join(', ')}.`);
  }
  const run_id = runId || `run-${hash(`${workspaceId}:${workflowId}:${taskPath}`, 24)}`;
  const content = [
    '---',
    'type: run',
    `title: ${yamlString(`Run ${run_id}`)}`,
    `description: ${yamlString(`Workflow run for task ${taskPath}.`)}`,
    `timestamp: ${yamlString(iso(startedAt, 'startedAt'))}`,
    `run_id: ${yamlString(run_id)}`,
    `workflow_id: ${yamlString(workflowId)}`,
    `task_id: ${yamlString(taskId)}`,
    `task_path: ${yamlString(taskPath)}`,
    `workspace_id: ${yamlString(workspaceId)}`,
    `status: ${status}`,
    `started_at: ${yamlString(iso(startedAt, 'startedAt'))}`,
    '---',
    '',
    `### run created - ${iso(startedAt, 'startedAt')} - ${status}`,
    `Task: ${taskPath}`,
    '',
  ].join('\n');
  return {
    type: 'operation',
    idempotency_key: `runtime-run-${hash(`${workspaceId}:${workflowId}:${taskPath}:${run_id}`, 32)}`,
    path: `runs/${workflowId}/${run_id}/RUN.md`,
    workspace_id: workspaceId,
    content,
    intent: 'Runtime run created for claimed task',
    actor,
  };
}
