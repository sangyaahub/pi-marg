---
description: Start and enforce PiMarg for each new substantive task.
alwaysApply: true
---

# PiMarg global rule

For every new substantive user task, load and follow the `auto-mode-router` skill before doing the work.

- Do not restart intake for acknowledgements, clarifications, approval replies, or follow-ups that belong to the active task.
- If the conversation already contains an active Auto Mode session record, reuse it. Start a new intake only when the user starts a materially different task or invokes `/auto-reset`.
- The first intake question is always whether the work is for a job/client or personal.
- Confirm one of work types 1–7, then confirm skill mode 1–4 before execution.
- After skill mode, use the live `auto_model_route` catalog and record required A/B/C/D choices. A and C must use different underlying models; B and D must use different underlying models.
- Activate the saved model before each A/B/C/D stage. Never guess or pin a version absent from the active Pi or OMP registry.
- Call `auto_runtime_status` during intake and route only through capabilities it reports available.
- Use exactly one primary workflow spine for the task. Do not let multiple skill families maintain competing plans or state.
- For work types 2–6, load `codegraph-first` and require a healthy initialized CodeGraph before repository-wide architecture or impact claims. Use detected LSP/AST or repository-native tools for precise questions. Never conceal missing graph coverage behind a broad grep/glob crawl.
- Keep C and D as independent recorded review stages. A detected advisor may watch continuously, but it cannot approve actions or replace the final C/D verdict.
- Use OMP `workflowz`/`orchestrate` or a detected `task` fan-out only when work is genuinely independent. Isolate parallel writes, integrate them into one canonical tree, and verify again before D.
- Run conditional verification after B: repository checks always, DAP debugging for supported runtime defects, browser/desktop QA for affected user flows, and security review for type 5 or high-risk changes.
- Use checkpoint/rewind only when the runtime exposes those tools with the documented disposable-investigation semantics. They are not filesystem checkpoints or stage-completion markers.
- Ponytail, Hindsight, and language skills are supporting add-ons only. Verify they are discovered, isolate job/client memory, and never let them create a competing plan.
- Prefer the runtime's detected memory integration. Recalled memory is heuristic; job/client retention stays off until policy permits it.
- Track the plan, decisions, evidence, approval events, and lessons status in Markdown as defined by the router.
- For job/client work, never add Sangyaa branding, names, logos, metadata, promotional copy, or footers unless the user explicitly approves that exact artifact. Preserve the existing client/employer brand.
- For personal work, do not add Sangyaa branding automatically. Use it only when requested or already established by the project.
- Never claim an unavailable skill, model, plugin, or tool was used. Offer a compatible route when a requested family is unavailable.
- Before final completion, run `session-lessons` exactly once for the active Auto Mode session and record it in the session ledger.
- After review passes, offer a local commit through the runtime or repository-native path. Never combine that step with push or merge.
- Keep `/collab` and `/share` off by default when present. Both require one-use `post-web` approval; job/client sharing should default to view-only.
- Delete/remove actions, pushing to main, merging a PR, and posting or publishing to a web platform require explicit one-use user approval. The runtime guard is authoritative when it blocks a tool.
