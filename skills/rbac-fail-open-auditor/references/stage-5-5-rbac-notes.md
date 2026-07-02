# Stage 5.5 RBAC — line-by-line notes

`src/engine.mjs`, inside `processOperation()`, runs after content validation
(Stage 5) and before the dry-run/commit split. This section only executes
`if (valid)` — i.e. only once the envelope has already passed content
validation.

## Current (fixed) logic

```js
const actorRole = envelope.actor?.role || null;
const permType = envelope.type === 'event' ? 'event' : resolvedType;
const requiredPerm = `write:${permType}`;
let allowed = false;
if (actorRole === 'system') {
  allowed = true;
} else if (actorRole) {
  let perms = [];
  if (actorRole === 'admin') perms = ['write:*', 'read:*'];
  const roleFile = path.join(vaultRoot, 'roles', actorRole, 'ROLE.md');
  if (fs.existsSync(roleFile)) {
    try {
      const { data } = parseDocument(fs.readFileSync(roleFile, 'utf8'));
      if (data.permissions) perms = data.permissions;
    } catch {}
  }
  allowed = perms.includes('*:*') || perms.includes('write:*') || perms.includes(`*:${permType}`) || perms.includes(requiredPerm);
}
// else: actorRole is absent — allowed stays false (fail closed).
```

Four distinct code paths, in order of precedence:

1. **`actorRole === 'system'`** → unconditional `allowed = true`. Used by
   `src/bundle.mjs`'s `provisionBundle()`, which stamps every generated
   envelope with `actor: { role: 'system' }` so provisioning bypasses
   per-role permission checks entirely. Intentional; not a bug.
2. **`actorRole === 'admin'`** → `perms` starts as `['write:*', 'read:*']`
   *regardless of whether `roles/admin/ROLE.md` exists or what it says* (a
   `roles/admin/ROLE.md` can still ADD permissions via the `fs.existsSync`
   branch below it, but can't remove the hardcoded grant). Intentional
   built-in privileged role.
3. **A real named role** (anything else, if `actorRole` is truthy) → reads
   `roles/<role>/ROLE.md` from the VAULT filesystem. If the file doesn't
   exist, `perms` stays `[]` and the role is denied everything. If it
   exists, `data.permissions` (a YAML block list) becomes `perms`.
4. **Absent `actor` / falsy `actorRole`** → `allowed` stays `false`. This is
   the fail-closed path — the historical bug bypassed this entirely with an
   `|| 'admin'` fallback.

`permType` is `'event'` for event envelopes (they have no resolved document
type — see below) and `resolvedType` (the document's `type:` frontmatter
field, or the pre-existing file's type for `patch`/`delete`) otherwise.

## The historical bug (fixed, kept here for context)

```js
// BEFORE (fail-open):
const actorRole = envelope.actor?.role || 'admin';
```

Any envelope with no `actor` field at all resolved to `'admin'`, the same as
an explicitly-verified admin session — silently granting full `write:*`
access to any caller that simply omitted the field. This directly
contradicted the Stage 3 mandate (`docs/ssss-spec.md` §6.3): a host exposing
the Operation Contract to untrusted clients MUST overwrite `actor` with
verified identity before RBAC runs — a host that forgot to do so should
have every write DENIED, not silently promoted to admin.

```js
// BEFORE (the resolvedType was never set for `event` envelopes):
const requiredPerm = `write:${resolvedType}`; // resolvedType is always null for events
```

`resolvedType` is declared `null` at the top of `processOperation()` and is
only ever assigned inside the `operation`/`patch`/`delete` branches — the
`event` branch (which just JSON-parses `envelope.content`) never touches it.
So every event write was checked against the literal permission string
`write:null`, which no legitimately-configured role would ever hold except
via a `*:*`/`write:*` wildcard — meaning any narrowly-scoped role (e.g. one
meant to log events) was incorrectly DENIED on every event write. This is
the opposite failure mode from the actor bug (over-restrictive rather than
over-permissive), but both stem from the same root cause: a field
(`resolvedType`) that Stage 5.5 assumes is always meaningful, but isn't for
every envelope type.

## Regression coverage

`conformance/fixtures.json`:
- **fixture-011** — no `actor` field → must be denied (proves the
  fail-closed default).
- **fixture-015/016** — a `write:event`-only role successfully writes an
  event (proves events resolve a real, satisfiable permission).
- **fixture-017/018** — a `read:*`-only role is denied on an event write
  (proves the permission check is actually gating, not just always-true
  once `permType` is fixed).

This skill's `probe-rbac.mjs` scenario `event-wrong-type-permission-denied`
additionally proves a role scoped to `write:assistant` (a REAL, different
permission) is still denied on an event write — ruling out an over-broad
match where any `write:*` prefix incorrectly satisfies `write:event`.
