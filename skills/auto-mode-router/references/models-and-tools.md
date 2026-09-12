# Models, agents, and tools

## Live A/B/C/D routing

`auto_model_route` builds its catalog from the active runtime every time it is called: Pi uses scoped or authenticated available models, while OMP uses `ctx.models.list()`. Exact versions come from that live registry, not this document.

Catalog text is compact and provider-grouped. Call `action: catalog` first to list every provider with counts, then call again with `provider=<name>` to list every model for that provider as numbered options. Both OMP and Pi adapters accept the optional `provider` parameter. Never present a hand-curated Claude/Codex/Cursor subset when other authenticated providers (including Devin) are in the catalog.

| Stage | Purpose | Eligible live groups | Normal agent and tools |
|---|---|---|---|
| A | Thinking/discovery | Claude Fable/Opus; OpenAI Astra/Sol; current Grok 4.6-or-newer | strategy skill; detected CodeGraph/LSP/AST tools, web for current facts; no implementation writes |
| C | Plan second-eye | Same frontier pool, excluding A's underlying model | independent reviewer; plan, decisions, risks, read-only evidence; optional detected watcher |
| B | Plan execution/coding | Claude Sonnet; OpenAI Terra/Luna/Codex-class; Cursor Composer; zero-metered Cursor/Devin routes; native Devin SWE; external Devin | builder/debugger method; detected code intelligence, tests, shell, and bounded task fan-out |
| D | Implementation/code second-eye | Same execution pool, excluding B's underlying model | detected review command or independent reviewer; diff, impact, contracts, tests/scanners, no fixes |

The extension compares normalized provider-independent identities, so the same model reached through Cursor and a direct provider still counts as the same choice. Prefer a different provider family as well when practical.

OMP stage agents and the sequential Pi flow both inherit the model activated in the main session. Before each stage, call `auto_model_route` with `action: activate`; never assume the model remained selected after a manual model change.

Intake and lessons use the runtime's inexpensive/default model when configured. Native `devin/swe-*` entries are ordinary runtime models. A separate external Devin option appears only when a Devin tool is detected and returns a delegation instruction.

## Cross-family review

Prefer a reviewer from a different model family than the main implementer when risk or change size justifies it:

```text
Codex builds ──► Claude reviews
Claude builds ─► Codex reviews
Cursor/Grok builds ─► strongest available Claude or Codex reviews
```

This is a model separation, not a second workflow spine.

## Multi-agent use

Use multiple agents only when tasks are independently writable or purely read-only.

- Parallelize repository exploration, research, and independent reviews.
- For implementation, define file ownership and dependencies first.
- Prefer isolated worktrees for parallel writes.
- Integrate and verify each result against the advancing canonical tree.
- Fall back to serial work after repeated collisions or broad overlapping edits.
- Never use a swarm merely to make a small task look more sophisticated.

On OMP, `workflowz` and `orchestrate` may request native multi-agent behavior. On Pi, parallel work requires a compatible detected task/subagent extension. Neither route overrides the primary skill spine, model separation, evidence ledger, or approval gates.

## Native runtime gates

Call `auto_runtime_status` during intake. Follow [native-omp-runtime.md](native-omp-runtime.md) for OMP or [native-pi-runtime.md](native-pi-runtime.md) for Pi.

- Any advisor/watcher is supplemental and read-only; C/D remain required when their stage applies.
- Checkpoint/rewind may wrap disposable exploration only when the detected runtime documents those semantics.
- `auto-qa` runs after B and before D for affected browser/desktop flows or artifact inspection.
- A detected `security_scan` is used only when relevant; otherwise record the scanner/reviewer fallback.
- Detected memory recall/retain is used only after the context retention decision.
- A local commit is offered after acceptance, D, and required security gates pass; it never includes push.

## Tool recommendations

- Repository understanding: CodeGraph MCP/CLI is the authority for architecture, flows, candidate scope, and impact on work types 2–6 when available. Detected LSP handles exact symbols/types/renames/diagnostics; detected AST tools handle bounded structural queries or previewable rewrites. If CodeGraph is unavailable, record repository-wide impact as not verified rather than replacing it with a broad text crawl.
- Verification: the repository's own tests, type checker, linter, formatter, build, and browser/simulator tools when relevant.
- Bug discovery: detected DAP/debug tooling for supported live runtime failures, browser/desktop QA for user flows, and static/test evidence for backend or library code.
- Security: detected `security_scan` when available, otherwise repository-native dependency audit, secret scan, SAST rules, configuration review, and source-to-sink inspection. Validate findings before changing code.
- Current business/market facts: web research with source links; keep external posting disabled until approved.

## Provider recommendation for the user's accounts

- Cursor Composer or a zero-metered Cursor route: economical B/D work when present in the live catalog.
- Claude Fable/Opus: A/C product thinking, architecture, specification, and cross-family review.
- Claude Sonnet: B/D mid-layer implementation or review.
- OpenAI Astra/Sol: A/C complex discovery and plan review.
- OpenAI Terra/Luna/Codex-class: B/D implementation and review, chosen by task risk and cost.
- Latest matching Grok 4.6-or-newer model: A/C independent frontier analysis or current web/social context.
- Native Devin SWE: B/D when exposed by the runtime. External Devin: bounded delegation with acceptance criteria and a quota limit.

Use Pi or OMP's own authentication and model UI as the authority for what the account can actually access.
