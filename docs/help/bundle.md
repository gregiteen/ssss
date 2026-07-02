# The `.ucw` bundle format (spec §16)

A `.ucw` bundle is the transportable package of a vault — "a festival in a box."
It is plain JSON: a manifest plus the path-sorted vault files, content-hashed for
integrity. The container file is conventionally named `*.ucw.json`.

## Shape

```jsonc
{
  "manifest": {
    "name": "Festival in a Box",
    "description": "...",
    "version": "0.1.0",
    "exported_at": "1970-01-01T00:00:00.000Z",   // frozen → deterministic export
    "ssss_core_version": "0.6",
    "required_extensions": ["festech"],
    "export_profile": "sale",                      // backup | template | sale
    "primitive_inventory": { "workflow": 1, "page": 1, "rule": 1, "assistant": 1, "domain": 1 },
    "provisioning": [ /* steps, see `ssss help provisioning` */ ],
    "parameters":  [ /* template variables, see below */ ],
    "file_count": 5,
    "provenance": {
      "content_hash": "sha256:…",                  // over the canonical file serialization
      "exporter": "@ssss/cli"
    }
  },
  "files": [ { "path": "rules/refund-policy.md", "content": "---\n…" } ]
}
```

## Integrity

`provenance.content_hash` is `sha256` over the canonical (path-sorted) serialization
of `files`. `ssss validate` recomputes it and rejects any mismatch — a bundle cannot
be silently edited. `primitive_inventory` is registry-driven (a count per `type`),
not a closed category enum.

## Parameters

Each entry in `parameters[]` is a template variable resolved at provision time:
`{ key, label, type, scope, source }` where `source ∈ user | llm | graph | system`.
Required parameters must be supplied (`ssss provision --param key=value`) or the
plan is rejected.

Commands: `ssss export`, `ssss validate`, `ssss inspect`.
See also: `ssss help provisioning`, `ssss help portability`.
