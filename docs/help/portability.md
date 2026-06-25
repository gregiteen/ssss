# Portability classification (spec §5.5) — the keystone

Every document primitive declares a **portability class**. This is what makes a
vault sellable without leaking the operator's private data.

| Class | Meaning | Example types |
|-------|---------|---------------|
| `structural` | The sellable business model — the thing a buyer wants. | `workflow`, `rule`, `page`, `assistant` |
| `tenant_private` | The operator's private data. **Never** sold or templated. | `task`, customer records |
| `resource_bound` | Needs a real resource bound at provision time. | `domain`, `phone_number`, `integration_connection` |

A file MAY override its type default with `x_portability` in frontmatter. The most
restrictive of (type default, override) wins.

## Export profiles are filters over the classes

| Profile | Includes | Use |
|---------|----------|-----|
| `backup` | structural + tenant_private + resource_bound | Full operator backup/restore. |
| `template` | structural + resource_bound | A reusable template, private data stripped. |
| `sale` | structural + resource_bound | A tradeable business, private data stripped. |

> `template` and `sale` exports MUST drop every `tenant_private` primitive. The
> reference bundle (`conformance/reference-bundle.ucw.json`) proves this: its
> `task` ticket is dropped from the `sale` export.

See also: `ssss help bundle`, `ssss help export`.
