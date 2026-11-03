export interface SchemaValidationError {
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

export interface ValidateJsonSchemaOptions {
  rootSchema?: Record<string, unknown>;
}

export function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
  options?: ValidateJsonSchemaOptions
): SchemaValidationResult;

export function getCoreRegistrySchema(): Record<string, unknown>;
export function getBundleSchema(): Record<string, unknown>;
export function validateRegistryAgainstSchema(registry: unknown): SchemaValidationResult;
export function validateBundleAgainstSchema(bundle: unknown): SchemaValidationResult;
