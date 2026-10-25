<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->
## TOTAL RECALL CLI — USE IT FOR EVERYTHING (run `total-recall <command> --help` before guessing)
- Built-in commands: `app` · `init` · `setup` · `start` · `startup` · `deploy` · `doctor` · `backup` · `dream` · `lint` · `daemon` · `restore` · `upgrade` · `update` · `friction` · `chat` · `status` · `remember` · `forget` · `edit` · `recall` · `context` · `context-stats` · `rules` · `search` · `research` · `proposals` · `proposal` · `task` · `share` · `generate-pat` · `key` · `keys` · `pat` · `hash-password` · `reset-password` · `compile` · `rebuild` · `snapshot` · `migrate` · `backfill` · `ingest` · `import` · `connect` · `sync` · `relay` · `uninstall` · `map` · `brain` · `config` · `skill` · `project-id` · `api` · `brief` · `group` · `groups` · `help` · `collab` · `command` · `export` · `harness` · `watch` · `agent` · `agents` · `new` · `plugin` · `plugins` · `scaffold` · `scaffold-plugin`
- Memory: `context "<task>" --action <a>` · `recall "<q>" --local` · `remember <category> "<text>" --global|--project` · `edit <slug>` · `compile` · `brief` · `status` / `doctor`
- CREDENTIALS GO THROUGH THE AUTH PLUGIN ONLY (Total Recall has no native secrets store; never hand-roll curl/sed/ssh for keys): `auth secret list|get <K>|set <K> --stdin|rotate <K> --stdin|--from-clipboard [--remote <t>]|rotate-auto <K>|rotation-due|shared|meta|catalog|audit|diff-env|export-env`; remote targets: `auth secret remote add|list|deploy <t> [--keys a,b] [--dry-run]`. The store follows `TR_SECRETS_BRAIN`.
- Auth: `auth status|audit|key list|issue|revoke|password set --stdin|passkey|google status`
- Mesh nodes: `mesh nodes|status|ping|exec <node> <cmd>|ssh <node> [cmd]|access <node>|leader` — never ssh a machine into itself.
- Agents and work: `agent spawn|list|logs|kill` · `harness dispatch|council` · `task <cmd>` · `plugin list|install|info|library` · `skill <cmd>` · `brain <cmd>` · `daemon <cmd>` · `update --all-brains --apply`
- Every installed plugin namespace and its operations is listed next; run `total-recall <namespace> --help` for flags.

## Installed Plugins & Capabilities

Use Total Rec