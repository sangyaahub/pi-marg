---
description: List or change the active Auto Mode A/B/C/D model selections from OMP's live authenticated catalog.
argument-hint: [status | choose]
---

Load `auto-mode-router` and read its model-routing reference.

- With no argument or `status`, call `auto_model_route` with `action: status`, then show the saved A/B/C/D selectors and separation checks.
- With `choose`, call `auto_model_route` with `action: catalog` and the active work type. Present only required stages and exact available selectors. Save each answer with `action: select`.
- Do not type or persist a model ID that the live catalog did not return.
- Distinguish native `devin/swe-*` OMP models from the optional external `devin/mcp-session` route. Only creating the external session requires `post-web` approval.
- C/D are the authoritative independent review selectors. A configured OMP advisor is supplemental and must not weaken the A≠C or B≠D checks.
