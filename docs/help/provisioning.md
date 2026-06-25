# The provisioning contract (spec §17)

Three deterministic, idempotent verbs move a bundle from an export into a live vault.

| Verb | Signature | What it does |
|------|-----------|--------------|
| `export` | vault + profile → bundle | Pure. Profile-filtered, content-hashed. |
| `provision` | bundle + params → plan | Resolves parameters + link integrity + id-remap → an ordered list of Operation Contract envelopes. Touches no filesystem. |
| `import` | plan + engine → state | Replays each envelope through the §6 engine. Idempotent. |

```
ssss export ./vault --profile sale --out fest.ucw.json
ssss provision fest.ucw.json --param domain=acme.live --out plan.json
ssss import --plan plan.json --vault ./new-tenant
# or in one step:
ssss import fest.ucw.json --vault ./new-tenant --param domain=acme.live
```

## Determinism & idempotency (§17.3)

- **Id-remap.** `--prefix` relocates every file under a target path; link integrity
  is checked against the remapped target, so `[[links]]` never dangle after a move.
- **Idempotency keys.** Each envelope's key is `sha256(workspace_id + ':' + path)`,
  truncated. Re-importing the same plan commits nothing new — `import` reports the
  unchanged count.
- **Link integrity.** `provision` fails closed if any `[[ref]]` points at a file not
  present in the bundle.

## Provisioning steps & binding vocabulary (§17.2)

`manifest.provisioning[]` describes the real-world resources an importer must wire up.
Each step: `{ id, label, system, mode, required }`.

- `system ∈ workspace | branding | email | phone | domains | accounts | deployments | marketplace | tabs | automation`
- `mode ∈ existing | provision | install | generate | configure`

Graph edges use relations like `uses_brand`, `owns_domain`, `routes_calls_to`,
`deploys_to`, `installs_pack`. Composition across bundles uses `installMode ∈
optional | recommended | required`; upgrades are structural-only via `migration` +
`patch`.

Commands: `ssss provision`, `ssss import`.
See also: `ssss help bundle`, `ssss help portability`.
