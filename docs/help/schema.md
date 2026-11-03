# JSON Schemas (Draft 2020-12, spec §5 / §16)

Canonical Draft 2020-12 JSON Schemas for SSSS core/extension registries and `.ucw` transport bundles.

## Shipped schema files

| Schema | Path / Subpath export | Governs |
|--------|-----------------------|---------|
| Core & Extension Registry | `@gregiteen/ssss-cli/schemas/core-registry.schema.json` | `registry/core.json`, `registry/extensions/*.json`, and runtime extension registries (§5). |
| `.ucw` Bundle | `@gregiteen/ssss-cli/schemas/bundle.schema.json` | `.ucw` transport bundle containers and manifests (§16). |

 Both schemas enforce `"additionalProperties": false` on structured objects so unknown or misspelled properties fail closed.

## CLI commands

```bash
ssss schema core                                       # Print the core/extension registry schema
ssss schema bundle --out ./bundle.schema.json          # Write the bundle schema to a file
ssss schema export --out ./schemas                     # Copy both schemas into a directory
ssss schema validate registry/core.json                # Validate a registry or bundle JSON file
ssss schema validate festival.ucw.json --type bundle   # Explicit schema kind
ssss schema validate custom.json --json                # Machine-readable validation report
```

## Programmatic API (`@gregiteen/ssss-cli/schema-validator`)

```js
import {
  getCoreRegistrySchema,
  getBundleSchema,
  validateRegistryAgainstSchema,
  validateBundleAgainstSchema,
  validateJsonSchema,
} from '@gregiteen/ssss-cli/schema-validator';

const { valid, errors } = validateRegistryAgainstSchema(myExtensionRegistry);
```

Commands: `ssss schema`, `ssss registry`, `ssss validate`.
See also: `ssss help bundle`, `ssss help overview`.
