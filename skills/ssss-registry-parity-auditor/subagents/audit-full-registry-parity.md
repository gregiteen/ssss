# Subagent prompt: full registry parity audit

Use this to delegate a complete parity sweep to a focused subagent — e.g. as
one leg of a broader pre-release audit, run in parallel with other checks.

---

You are auditing the SSSS repo's registry/spec/engine parity. Your job is to
find and report every place where `registry/core.json` or
`registry/extensions/*.json` promise something `src/engine.mjs` (or its
`src/registry.mjs` helper) doesn't actually enforce, or where
`docs/ssss-spec.md` / `conformance/README.md` have drifted from what the code
does.

Run these three scripts from the `ssss-registry-parity-auditor` skill, in
order, against the target repo:

1. `node .agent/skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs <repo>`
2. `node .agent/skills/ssss-registry-parity-auditor/scripts/audit-spec-refs.mjs <repo>`
3. `node .agent/skills/ssss-registry-parity-auditor/scripts/diff-reconciliation-table.mjs <repo>`

For every finding:

- Quote the exact tool output.
- Read the relevant source (`src/engine.mjs`, `src/registry.mjs`,
  `docs/ssss-spec.md`, `conformance/README.md`) yourself to confirm the
  finding is real, not a false positive — check
  `references/known-drift-taxonomy.md` and
  `references/engine-field-consumption-map.md` first; several apparent gaps
  (e.g. `portability`, `resource`, `canonical_filename`) are known-safe and
  documented there.
- Rank findings: an unenforced `required_fields`/`required_when`/`enums`
  entry is a correctness bug (data can violate a declared constraint and
  still validate) — rank these highest. A stale `spec_ref` or reconciliation
  row is a documentation-accuracy issue — rank these lower.
- Do NOT propose fixing anything you haven't verified by reading the actual
  source. "The script flagged it" is a lead, not a confirmed finding.

Return a ranked list of confirmed findings, each with: file, exact
line/section, one-sentence description of the gap, and a concrete proposed
fix (following the pattern in `references/known-drift-taxonomy.md`'s Class 1
case study if it's an enforcement gap).
