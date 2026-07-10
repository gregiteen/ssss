/** Verified identity and fail-closed capability authorization contracts. */
const PRINCIPAL_KINDS = new Set(['human', 'agent', 'service', 'system']);
const ACTIONS = new Set(['create', 'replace', 'patch', 'append', 'event', 'delete', 'define', 'migrate']);
const ASSURANCE = { unverified: 0, verified: 1, elevated: 2, hardware: 3 };

export function validateVerifiedPrincipal(principal) {
  const errors = [];
  if (!principal || typeof principal !== 'object') errors.push('Verified principal is required.');
  else {
    if (typeof principal.id !== 'string' || !principal.id) errors.push('Principal id is required.');
    if (!PRINCIPAL_KINDS.has(principal.kind)) errors.push(`Principal kind must be one of: ${[...PRINCIPAL_KINDS].join(', ')}.`);
    if (!Array.isArray(principal.workspaceIds)) errors.push('Principal workspaceIds must be an array.');
    if (!principal.authentication || typeof principal.authentication.provider !== 'string') {
      errors.push('Authentication provenance is required.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function requiredCapabilities(definition, action) {
  if (!ACTIONS.has(action)) throw new Error(`Unknown authorization action '${action}'.`);
  const declared = definition?.capabilities?.[action];
  if (Array.isArray(declared) && declared.length) return declared;
  const primitive = definition?.qualified_type || definition?.type || 'unknown';
  return [`${primitive}:${action}`];
}

export function createCapabilityAuthorizer(options = {}) {
  const policyFloors = options.policyFloors || {};
  return async function authorize({ principal, workspaceId, definition, action, context = {} }) {
    const principalValidation = validateVerifiedPrincipal(principal);
    if (!principalValidation.valid) return { allowed: false, reason: principalValidation.errors.join(' ') };
    if (principal.kind !== 'system' && !principal.workspaceIds.includes(workspaceId)) {
      return { allowed: false, reason: `Principal '${principal.id}' is not scoped to workspace '${workspaceId}'.` };
    }
    const floorKey = definition?.qualified_type || definition?.primitive_id || definition?.type;
    const required = new Set([
      ...requiredCapabilities(definition, action),
      ...(policyFloors[floorKey]?.[action] || []),
      ...(context.policyFloor || []),
    ]);
    const granted = new Set(principal.capabilities || []);
    if (principal.kind === 'system' && options.systemBypass !== false) return { allowed: true, required: [...required] };
    const missing = [...required].filter((capability) =>
      !granted.has(capability) && !granted.has('*:*') && !granted.has(`${capability.split(':')[0]}:*`));
    if (missing.length) return { allowed: false, required: [...required], missing, reason: `Missing capabilities: ${missing.join(', ')}.` };
    if (context.requiresHumanConfirmation && principal.kind !== 'human') {
      return { allowed: false, required: [...required], reason: 'A verified human confirmation is required.' };
    }
    if (context.requiresHumanConfirmation && context.humanConfirmation !== true) {
      return { allowed: false, required: [...required], reason: 'Explicit human confirmation is required.' };
    }
    if (context.requiredAssurance) {
      const actual = ASSURANCE[principal.authentication.assurance] ?? -1;
      const requiredAssurance = ASSURANCE[context.requiredAssurance] ?? Number.POSITIVE_INFINITY;
      if (actual < requiredAssurance) {
        return { allowed: false, required: [...required], reason: `Authentication step-up to '${context.requiredAssurance}' is required.` };
      }
    }
    return { allowed: true, required: [...required] };
  };
}
