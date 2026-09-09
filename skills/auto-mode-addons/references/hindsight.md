# Hindsight memory and backup

Use Hindsight only through an integration the active runtime actually exposes. `auto_runtime_status` must detect the relevant memory tools before the workflow claims recall or retention occurred.

## Configure securely

### OMP

OMP provides a native Hindsight backend. Use `/settings` or OMP configuration:

```yaml
memory:
  backend: hindsight
hindsight:
  apiUrl: http://localhost:8888
  scoping: per-project
  autoRecall: true
  autoRetain: false
  recallBudget: low
  recallMaxTokens: 512
```

The default endpoint is local. When authentication is required, set `HINDSIGHT_API_TOKEN` in the user's secure environment; never put the token in this plugin, a prompt, the ledger, or a repository.

Use `per-project` for hard client/employer isolation. `per-project-tagged` may mix untagged global recall with project-tagged memory and therefore requires an explicit policy decision for sensitive work.

Run `/memory diagnose` after configuration. If `auto_runtime_status` does not show the native memory context plus the expected recall/retain/reflect tools, treat Hindsight as unavailable.

### Pi

Pi does not receive OMP's native Hindsight backend from this package. Install or create a trusted Pi memory extension that exposes explicit `recall` and `retain` tools, configure it according to Hindsight's current documentation, and verify it with `auto_runtime_status`. Until those tools appear, keep memory off and use the local Markdown lesson only.

## Session policy

- Job/client: default memory to off. Enable recall or retention only after confidentiality and retention policy allow the selected service and bank.
- Personal: recommend recall-only first; enable retention after the first successful diagnostic.
- At session start, recall only facts relevant to the confirmed context and repository.
- Treat recalled memory as heuristic and verify it against the current repository.
- At close, write `lessons.md` first, then retain only verified decisions, conventions, and the reusable lesson summary.
- Never retain secrets, credentials, raw client data, personal data, large source dumps, noisy transcripts, or unvalidated hypotheses.

Do not assume a `memory_edit` tool exists. Use Hindsight's supported UI/API for server-side deletion or correction, with the applicable approval gate.

## Backup policy

For self-hosted PostgreSQL or pg0, create a consistent full backup with:

```bash
hindsight-admin backup /secure-backups/hindsight-YYYY-MM-DD.zip
```

Keep at least one encrypted copy on a different device or storage provider. Prefer a versioned Backblaze B2 or S3-compatible bucket for low-cost automation, or Google Drive for a simpler manual route. Uploading the copy requires `post-web` approval. Verify the archive and periodically test restoration into a fresh disposable schema or instance.

`hindsight-admin restore` deletes the target schema before import. Show the exact target and obtain `delete-remove` approval first. Use bank export/import for portability when supported, prefer a fresh target bank, and verify counts after import.
