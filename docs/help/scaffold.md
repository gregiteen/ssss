# `ssss new` — scaffold a project

Create a fresh, ready-to-run repo wired for SSSS (and optionally Total Recall).

```bash
ssss new my-app                          # scaffold ./my-app
ssss new my-app --install                # also npm install + run the conformance test
ssss new my-app --with-total-recall      # also wire the Total Recall memory OS
ssss new my-app --with-total-recall --install
```

## What you get

```
my-app/
  package.json        @ssss/cli pinned to this CLI's version tag; npm test = node --test
  vault/              Starter SSSS documents:
    rules/welcome.md         (structural)
    workflows/onboarding.md  (structural, links [[welcome]])
    assistants/concierge.md  (structural)
    tasks/first-task.md      (tenant_private — dropped from sale/template exports)
  test/ssss-conformance.test.mjs   Replays the canonical fixtures through the engine
                                    AND round-trips the vault as a sale bundle.
  CLAUDE.md           Agent guide (source-of-truth + portability rules).
  README.md  .gitignore
```

The generated test is **dependency-free** (`node --test`): it proves the toolchain
implements the Operation Contract (§6) and that the starter vault exports, validates,
provisions, and re-imports idempotently as a `sale` bundle (§16/§17) — with the
`tenant_private` task correctly dropped.

## Flags

| Flag | Effect |
|------|--------|
| `--name <s>` | Package name (default: the directory name). |
| `--with-total-recall` | Add `total-recall-brain` + memory wiring to CLAUDE.md/README. |
| `--install` | Run `npm install`, Total Recall `init` (if requested), then `npm test`. |
| `--no-git` | Skip `git init`. |
| `--ref <git-ref>` | Pin `@ssss/cli` to a specific tag/branch/SHA (default: this CLI's version tag). |
| `--force` | Scaffold into a non-empty directory. |

Shelling out (git/npm/npx) uses `execFileSync` with fixed argument vectors — no shell,
no interpolation.

See also: `ssss help portability`, `ssss help provisioning`, `ssss export`.
