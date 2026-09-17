---
description: List or change A/B/C/D models and the high/low automatic recovery pair from Pi's live authenticated catalog.
argument-hint: [status | choose]
---

Load `auto-mode-router` and read its model-routing reference.

- With no argument or `status`, call `auto_model_route` with `action: status`, then show the saved A/B/C/D selectors, separation checks, high/low backups, active fallback, and last failover.
- With `choose`, call `auto_model_route` with `action: catalog` and the active work type. Present required stages and exact available selectors. Save each stage with `action: select`, then save two distinct runtime models with `action: select_fallback`, first `fallback: high`, then `fallback: low`.
- Do not type or persist a model ID that the live catalog did not return.
- Treat any model returned by Pi's registry as a normal in-session route. Treat Devin or another external coding-agent session as a capability-gated external route; creating one requires `post-web` approval.
- C/D are the authoritative independent review selectors. Any detected advisor or watcher is supplemental and must not weaken the A≠C or B≠D checks.
