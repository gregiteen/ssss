# Semantic projection (spec §11.9)

SSSS builds a deterministic search and graph projection directly from validated
Markdown. The projection is disposable: the vault remains the only source of truth.

```bash
ssss semantic ./vault
ssss semantic ./vault --query "refund policy" --limit 5
ssss semantic ./vault --query "política de reembolsos"
ssss semantic ./vault --out ./derived/semantic.json
```

Records include stable identity, source path and hash, type, portability, surface
text, normalized Unicode tokens, and graph edges derived from `relations`, wiki
links, and Markdown links. Results use deterministic weighted lexical ranking; hosts
may fuse embeddings without replacing this interoperable baseline.

## Privacy and output safety

Only `structural` documents are indexed by default. `tenant_private` and
`resource_bound` sources require the explicit `--include-private` option and an
authorized caller. This option can expose customer or operational data; never enable
it for a public index.

`--out` must point to a regular file outside the source vault. Writes are atomic.
Symlinked vault entries and unsafe paths fail closed.

## Library API

```js
import { buildSemanticIndex, searchSemanticIndex } from '@gregiteen/ssss-cli/semantic';

const index = buildSemanticIndex('./vault');
const results = searchSemanticIndex(index, 'reembolsos', { limit: 10 });
```

Hosts may inject a multilingual embedding adapter and runtime renderer. Presentation
may change language and formatting, but never symbolic controls or authorization.
