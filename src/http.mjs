/** Reference transport adapters. HTTP is a façade over kernel.execute, never a writer. */

export function createCommandHandler({ kernel, authenticate, parseBody = async (request) => request.json() }) {
  if (!kernel?.execute || typeof authenticate !== 'function') throw new Error('kernel and authenticate(request) are required.');
  return async function handle(request) {
    try {
      const principal = await authenticate(request);
      const envelope = await parseBody(request);
      const response = await kernel.execute(envelope, { principal, request });
      const status = response.success ? (response.replay ? 200 : response.dry_run ? 200 : 201) :
        response.validation?.errors?.some((error) => error.includes('Access denied')) ? 403 :
        response.validation?.errors?.some((error) => error.includes('Idempotency')) ? 409 : 422;
      return { status, headers: { 'content-type': 'application/json' }, body: response };
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
