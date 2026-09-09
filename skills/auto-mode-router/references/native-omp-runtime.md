# Native OMP runtime integration

Use this reference after `auto_runtime_status` reports what the active OMP session actually exposes. Optional native features must degrade cleanly; never claim a gated tool ran when it was unavailable.

## Workflow shape

```text
A discovery ──► C independent plan review ──► plan gate
                                               │
                                               ▼
                                     B implementation
                                               │
                                               ▼
                                   conditional verification
                                  tests · DAP · browser/desktop
                                               │
                                               ▼
                                      D code review
                                               │
                                               ▼
                                 conditional security review
                                               │
                                               ▼
                               lessons/memory ──► optional commit
```

The A/B/C/D models remain the authoritative separation contract. Native OMP features strengthen those stages; they do not silently replace or skip them.

## Advisor

The native advisor is an optional continuous watcher, not approval authority and not a replacement for the final C or D verdict.

- Offer it when the `advisor` command is present and the user accepts its extra model usage.
- Use a different underlying model family from the active A or B model when practical.
- Keep advisor tools read-only. Prefer `read` and `lsp`; do not grant `write`, `edit`, `bash`, or `eval` merely for convenience.
- Use `/advisor configure` to set project/user `WATCHDOG.yml`, `/advisor on` to enable it for the session, and `/advisor status` to verify the actual model and usage.
- Do not silently rewrite the user's global `modelRoles.advisor` or existing `WATCHDOG.yml`.

## Deterministic and parallel execution

`workflowz` is an explicit user prompt control for a deterministic multi-agent workflow. `orchestrate` is appropriate for substantial independent work whose decomposition is less fixed. The normal Auto Mode path may call `task` directly without either keyword.

For `task` fan-out:

1. Prove the units are independent or read-only.
2. Give the batch shared acceptance criteria and narrow per-item ownership.
3. Use isolated worktrees for parallel writes when available.
4. Require structured findings or patch/test evidence.
5. Integrate into one canonical tree and rerun the affected checks before D.

Use serial execution for a small change or overlapping files. A swarm is a scaling option, not a mandatory stage.

## Checkpoint and rewind

These tools prune disposable conversation exploration; they are not filesystem snapshots or generic stage markers.

- Use one checkpoint before a long research/debug branch whose raw transcript is not needed later.
- End it with exactly one rewind containing a concise evidence report.
- Never nest checkpoints.
- Do not rewind away an unresolved approval, security finding, required decision, or unrecorded acceptance evidence.
- If either tool is unavailable, continue normally and use the Markdown ledger for durable state.

## Verification routing

- Every implementation: focused tests, type checks, lint/build as applicable.
- Known or reproducible runtime defect: native DAP `debug` when supported.
- Web UI: browser helpers through `eval`; test first use, primary flow, invalid input, and dependency failure when relevant.
- Native desktop UI: computer helpers through `eval` when enabled.
- Type 5 or high-risk auth/secrets/money/personal-data changes: native `security_scan` when available, otherwise repository-native scanners plus `auto-security-reviewer`.
- D review: prefer OMP `/review`; use `auto-reviewer` read-only `task` fan-out when `/review` is unavailable or the workflow needs its recorded stage model.

Record each skipped or unavailable verification surface as `not verified` with its consequence.

## Memory and lessons

Prefer OMP's native memory backend over a separate ad-hoc MCP integration.

- Hindsight requires `memory.backend: hindsight`, a reachable service, and any token through `HINDSIGHT_API_TOKEN` or the user's secure OMP configuration.
- Use per-project isolation for client/employer repositories. Job/client retention remains off until policy permits it.
- Treat recalled memory as heuristic. Verify it against current repository evidence.
- At close, write `lessons.md` first. Then use `learn`/`retain` only when those tools are available and retention is approved.
- Never retain secrets, credentials, raw client data, personal data, or unvalidated hypotheses.

## Commit, sharing, and publication

- After D passes and acceptance evidence is complete, offer `omp commit` to create atomic commits. Do not push as part of that step.
- Push, PR creation, main push, merge, deployments, messages, and other web publication remain protected actions.
- `/collab` and `/share` are off by default and require one-use `post-web` approval. For job/client work, confirm the participant and use view-only unless write access is explicitly needed.
