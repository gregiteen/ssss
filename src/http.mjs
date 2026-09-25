/** Reference transport adapters. HTTP is a façade over kernel.execute, never a writer. */

/** Canonical HTTP status for each symbolic failure code (spec §6.5). */
export const ERROR_STATUS = Object.freeze({
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  lease_conflict: 409,
  version_conflict: 409,
  idempotency_conflict: 409,
  validation_failed: 422,
  internal_error: 500,
});

/** Map a kernel response to its HTTP status: 201 commit, 200 replay/dry run, else by error code. */
export function statusForResponse(response) {
  if (response?.success) return response.replay || response.dry_run ? 200 : 201;
  return ERROR_STATUS[response?.error?.code] || 500;
}

export function createCommandHandler({ kernel, authenticate, parseBody = async (request) => request.json() }) {
  if (!kernel?.execute || typeof authenticate !== 'function') throw new Error('kernel and authenticate(request) are required.');
  return async function handle(request) {
    try {
      const principal = await authenticate(request);
      const envelope = await parseBody(request);
      const response = await kernel.execute(envelope, { principal, request });
      return { status: statusForResponse(response), headers: { 'content-type': 'application/json' }, body: response };
    } catch (error) {
      return { status: 400, headers: { 'content-type': 'application/json' }, body: { success: false, error: { code: 'invalid_request', message: error.message } } };
    }
  };
}

export function createDomainCommand({ kernel, buildEnvelope }) {
  if (!kernel?.execute || typeof buildEnvelope !== 'function') throw new Error('kernel and buildEnvelope(input) are required.');
  return async function domainCommand(input, context) {
    const envelope = await buildEnvelope(input, context);
    return kernel.execute(envelope, context);
  };
}
