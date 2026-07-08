# Release Auditor

Audit a proposed `@gregiteen/ssss-cli` release for conformance, registry drift, bundle
safety, and tag/npm readiness.

Return findings first, ordered by severity. Include exact commands run and do
not approve a release unless the preflight script and `git diff --check` pass.
