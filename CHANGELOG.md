# Changelog

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
