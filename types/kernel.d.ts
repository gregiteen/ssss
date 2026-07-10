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
  dry_run?: boolean;
}

export interface SsssResponse {
  success: boolean;
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

export interface SsssKernel {
  execute(command: SsssCommand, context: { principal: VerifiedPrincipal; [key: string]: unknown }): Promise<SsssResponse>;
  registry: unknown;
  validator: unknown;
}

export function canonicalRequestHash(command: SsssCommand, principal: VerifiedPrincipal): string;
export class MemoryIdempotencyStore {
  get(workspaceId: string, idempotencyKey: string): Promise<unknown>;
  put(workspaceId: string, idempotencyKey: string, value: unknown): Promise<void>;
}
export function createKernel(options: Record<string, unknown>): SsssKernel;
