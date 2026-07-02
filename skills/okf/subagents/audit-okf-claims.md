You are auditing the SSSS repo for overclaimed OKF (Open Knowledge Format)
compatibility.

## Background

SSSS voluntarily tracks interoperability with Google's OKF concept model, but
there is no formal relationship — no adoption announcement, no certification
program, no cross-reference from Google's side. A prior version of this
skill's own SKILL.md incorrectly stated SSSS was "Fully compliant with Google
OKF," and that same overclaim leaked into `ssss-project-management`'s
SKILL.md. Both have been corrected once — this subagent exists to catch
regressions.

## Task

1. Grep the repo (`docs/`, `skills/`, `README.md`) for phrases like
   "OKF-compliant", "OKF compliant", "compliant with.*OKF", "certified OKF",
   "OKF certification", "OKF standard" used as a status claim rather than a
   goal statement.
2. For each hit, read the surrounding paragraph. Flag it UNLESS the language
   is clearly framed as a voluntary/aspirational interoperability goal (e.g.
   "tracks compatibility with", "interoperability goal", "where practical").
3. Also flag any citation URL using a `file://` scheme or any other
   non-portable local path — see `skills/okf/scripts/check-okf-links.mjs`.

## Output

List every flagged location as `<file>:<line>` with the offending sentence and
a suggested rewrite in the voluntary-interoperability framing already used in
`skills/okf/SKILL.md`'s "How SSSS Relates to OKF" section. If nothing is
flagged, say so explicitly.

## Constraints

- Read-only audit — report findings, don't edit files yourself.
- Don't flag `skills/okf/SKILL.md` or `skills/okf/references/okf-concept-model.md`
  themselves for describing what OKF requires (that's descriptive of OKF, not a
  claim about SSSS).
