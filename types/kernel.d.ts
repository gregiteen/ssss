export type SsssCommandType = 'operation' | 'patch' | 'event' | 'delete';

export interface VerifiedPrincipal {
  id: string;
  kind: 'human' | 'agent' | 'service' | 'system';
  workspaceIds: string[];
  capabilities?: string[];
  authentication: { provider: string; assurance: string; [key: string]: unknown };
}

export interface SsssCommand {
  type: SsssCommandType;
  workspace_id: string;
  idempotency_key: string;
  path: string;
  operation_id?: string;
  primitive_type?: string;
  content?: string;
  patches?: Record<string, unknown> & { __body__?: string };
  lease_id?: string;
  expected_before_hash?: string;
  dry_run?: boolean;
}

export type SsssErrorCode =
  | 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'lease_conflict'
  | 'version_conflict' | 'idempotency_conflict' | 'validation_failed' | 'internal_error';

export interface SsssResponse {
  success: boolean;
  /** Present exactly when success is false (spec §6.5). */
  error?: { code: SsssErrorCode; message: string };
  type: SsssCommandType | null;
  operation_id: string;
  path: string;
  committed_at: string | null;
  dry_run: boolean;
  replay?: boolean;
  event_id?: string;
  validation: { valid: boolean; type: string | null; errors: string[]; warnings: string[] };
  repair?: { field_errors: Array<{ field: string; issue: string }> };
}

/** How recovery decided one commit intent (spec §6.3). */
export type SsssIntentOutcome = 'committed' | 'rolled_back' | 'discarded' | 'conflict' | 'failed' | 'in_flight';

export interface SsssRecoveryResult {
  path: string | null;
  operation_id: string | null;
  outcome: SsssIntentOutcome;
  reason?: string;
  /** Journal-relative location of an intent moved aside as unresolvable. */
  quarantined?: string;
}

export interface SsssKernel {
  execute(command: SsssCommand, context: { principal: VerifiedPrincipal; [key: string]: unknown }): Promise<SsssResponse>;
  /** Resolve commit intents whose writer is gone; report live ones as `in_flight`. */
  recover(): Promise<SsssRecoveryResult[]>;
  registry: unknown;
  validator: unknown;
}

/** Commit intent journal (spec §6.7). */
export interface SsssIntentJournal {
  run<T>(path: string, intent: Record<string, unknown>, commit: () => Promise<T>, options: { resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }> }): Promise<T>;
  recover(resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }>): Promise<SsssRecoveryResult[]>;
}

export const ERROR_CODES: readonly SsssErrorCode[];
export function canonicalRequestHash(command: SsssCommand, principal: VerifiedPrincipal): string;
export class MemoryIdempotencyStore {
  get(workspaceId: string, idempotencyKey: string): Promise<unknown>;
  put(workspaceId: string, idempotencyKey: string, value: unknown): Promise<void>;
}
export class MemoryIntentJournal implements SsssIntentJournal {
  run<T>(path: string, intent: Record<string, unknown>, commit: () => Promise<T>, options: { resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }> }): Promise<T>;
  recover(resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }>): Promise<SsssRecoveryResult[]>;
}
export class FileIntentJournal implements SsssIntentJournal {
  constructor(root: string, options?: { lock?: { timeoutMs?: number; staleMs?: number } });
  run<T>(path: string, intent: Record<string, unknown>, commit: () => Promise<T>, options: { resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }> }): Promise<T>;
  recover(resolve: (intent: Record<string, unknown>) => Promise<{ outcome: SsssIntentOutcome; reason?: string }>): Promise<SsssRecoveryResult[]>;
}
export function createKernel(options: Record<string, unknown>): SsssKernel;
