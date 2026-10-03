# Changelog

## 1.0.6 — 2026-10-03

- Reopening `/pi-marg` highlights the saved boundary, work type, skill, and A/B/C/D selectors. Enter keeps that row, and intake activates the first required stage model before the work message is sent.
- A saved route now survives a new OMP or Pi process. A selector that disappeared from the live catalog is reported missing and is not remapped or activated.
- An empty OMP catalog can sign in, add a custom OpenAI-compatible provider, or cancel. Provider files store the env var name, and the secret is written only to the runtime `.env`.

## 1.0.5 — 2026-09-26

- Documented how to register CheaperInference in Oh My Pi so Kimi and GLM models can be chosen at every A/B/C/D stage.
- Recorded the distinct-model rule and a high/low backup example for that provider.

## 1.0.4 — 2026-09-17

- Added two runtime-only recovery choices: a strong **high** backup followed by an economical **low** backup.
- Automatically switches and resumes after OMP or Pi settles a usage-limit/quota failure, with a visible notification and a no-repeat-side-effects continuation instruction.
- Handles direct runtime-model failures and detected model-execution tool failures (including external Devin and subagents); old v1 session routes migrate without losing their A/B/C/D selections.
- Deduplicates repeated failure events, ignores transient throttles, advances to low only when the active high model fails, restores Pi tree-navigation state, and warns without stranding the run if ledger persistence fails after activation.

## 1.0.3 — 2026-09-14

- Made model routing explicitly model-agnostic: live OMP/Pi authenticated catalogs are the only source of truth, with soft preferred-class ranking that never requires a maintainer's subscriptions.
- Promotes provider/subscription setup when the live catalog is empty (`/login` + `omp models` on OMP; `pi --list-models` on Pi).
- Shows required A/B/C/D stage options and catalog sections in ascending letter order.

## 1.0.2 — 2026-09-12

- Changed live catalog presentation to a provider-first numbered two-step: list every authenticated provider, then every model for the chosen provider.
- Added optional `provider` filter on `auto_model_route` catalog so agents can request one provider's full model list without truncating giant catalogs.
- Documented an OMP catalog advisory when both `cursor` and `openai-codex` are live: mid-session switches can hit a harness `call_id` max-length 64 rejection (tracked upstream in `@oh-my-pi/pi-coding-agent`); recover with a fresh session that does not replay the affected tool history.

## 1.0.1 — 2026-09-10

- Added the global `pi-marg start` and `pi-marg "<work prompt>"` OMP launch commands.
- Canonicalized the npm executable mapping so npm installs the global `pi-marg` command.
- Added native interactive OMP intake for work boundary, work type, workflow skill, and required A/B/C/D model choices.
- Changed model pickers to show every authenticated and enabled runtime model while ranking stage-appropriate choices first.
- Preserved independent-review enforcement: A cannot equal C, and B cannot equal D.

## 1.0.0 — 2026-09-08

- First PiMarg release for Pi Agent and Oh My Pi.
- Sangyaa visual identity, public repository metadata, npm package metadata, and OMP marketplace catalog.
- Shared A/B/C/D model-routing core with distinct-reviewer enforcement.
- Runtime-specific adapters for schemas, session events, model discovery, protected inputs, and automatic Pi workflow entry.
- Capability-gated CodeGraph, LSP, task, Advisor, review, memory, UI, debugger, and security routes.
- One-use approval guard for destructive actions, pushes, merges, sharing, and web publication.
- Responsive, offline interactive workflow demo.
