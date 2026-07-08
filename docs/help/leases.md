# Leases (spec §7)

Leases are file-level write locks checked by the Operation Contract before a
write commits. They protect paths that are being edited by another actor or host
process.

The reference engine expects lease state in a host-provided `leaseStore`:

```text
<leaseStore>/<workspace_id>/<sha256(path)>.lease.json
```

Each lease file contains:

```json
{
  "lease_id": "lease-123",
  "expires_at": "2026-07-08T23:00:00.000Z"
}
```

Behavior:

- If no lease exists, the write can continue.
- If a non-expired lease exists, the envelope must provide the matching
  `lease_id`.
- A mismatched or missing `lease_id` fails validation before commit.
- Expired leases are removed and do not block the write.
- Unreadable lease state fails closed; the engine refuses to guess.

See also: `ssss help roles`, `ssss help conformance`.
