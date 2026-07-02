# Subagent prompt: RBAC fail-open audit

Use this to delegate a Stage 5.5 RBAC audit to a focused subagent — e.g.
before a release, after any change to `src/engine.mjs`, or as one leg of a
broader security review run in parallel with other checks.

---

You are auditing Stage 5.5 (Granular Authorization / RBAC) in the SSSS
reference engine at `<repo>/src/engine.mjs`. Your job is to find any
envelope shape that gets allowed when it should be denied (fail-open) or
denied when it should legitimately be allowed (a correctness bug, lower
severity).

1. Read the CURRENT Stage 5.5 block in `src/engine.mjs` yourself first.
   Don't assume it matches `references/stage-5-5-rbac-notes.md` — that file
   documents a specific fixed state and a specific historical bug; your job
   is to check whether the CURRENT code still matches that fixed state or
   has drifted.
2. Run `node .agent/skills/rbac-fail-open-auditor/scripts/probe-rbac.mjs <repo>`.
3. For every FAIL-OPEN finding: this is a real security gap. Confirm it by
   reading the exact line(s) of `src/engine.mjs` responsible — do not report
   a finding you haven't traced to a specific code path. Then run
   `node .agent/skills/rbac-fail-open-auditor/scripts/emit-negative-fixtures.mjs`
   to generate a regression fixture for it.
4. For every unexpectedly-denied case: this is lower severity (a legitimate
   role incorrectly losing access, not a security hole) but still worth
   reporting — it usually means a new envelope type or permission pattern
   was added without updating the permission-resolution logic.
5. Read `references/permission-grammar.md` before judging any finding
   involving `admin` or `system` — these are NOT data-driven roles, and a
   probe that assumes they follow the same `roles/<role>/ROLE.md` lookup
   path as every other role will produce false findings.
6. If you have reason to believe a NEW attack surface exists that
   `scripts/enumerate-envelopes.mjs`'s scenario list doesn't cover (e.g. a
   new envelope type was added since this skill was built, or a new
   wildcard permission form), add a new scenario to that file's
   `buildScenarios()` array following the existing pattern, then re-run the
   probe — don't just report the gap in prose without attempting to close
   it.

Return a ranked list: FAIL-OPEN findings first (each with the exact
reproducing envelope, the responsible `src/engine.mjs` line, and the
generated fixture), then unexpectedly-denied findings, then a one-line
summary of what was probed and confirmed clean.
