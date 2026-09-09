---
name: auto-mode-router
description: Classify a new work request, select one development-method skill spine, route live stage models and tools on Pi or OMP, and maintain the PiMarg session ledger. Use at the start of each new substantive task; do not restart it for ordinary follow-ups.
---

# PiMarg Router

Turn a user request into one controlled workflow.

1. Read [intake-and-state.md](references/intake-and-state.md) and complete the intake stages in order.
2. After the user selects mode 1–4, read [routing-matrix.md](references/routing-matrix.md) and select exactly one primary skill spine.
3. Read [session-ledger.md](references/session-ledger.md), create the neutral Markdown ledger, and identify the selected spine's authoritative planning artifact.
4. Read [models-and-tools.md](references/models-and-tools.md). Call `auto_model_route` with `action: catalog` and the confirmed work type, present the live choices, and save each required A/B/C/D selection. The runtime rejects A=C and B=D.
5. Call `auto_runtime_status`. If it reports `OMP`, read [native-omp-runtime.md](references/native-omp-runtime.md); if it reports `Pi`, read [native-pi-runtime.md](references/native-pi-runtime.md). Record which advisor, task, review, checkpoint/rewind, code-intelligence, debugger, browser/desktop, security, and memory routes are actually available.
6. For work types 2–6, load `codegraph-first` and pass its bootstrap gate before making repository-wide architecture or impact claims. CodeGraph owns those claims when available. LSP, AST, compiler, and repository-native tools may handle precise operations; missing CodeGraph must be recorded rather than concealed behind broad grep output.
7. Load `auto-mode-addons` only for requested or configured Ponytail, Hindsight, language-specific, or cost-control support. An add-on never becomes a second workflow spine.
8. Before each routed stage, call `auto_model_route` with `action: activate` for that stage. Verify installed skills and tools before invoking them; never imitate a missing capability while claiming it ran.
9. Run A → C → B → conditional verification → D, adjusted by work type. Use an advisor only as an optional watcher, task fan-out only when a compatible tool exists and work is independent, and checkpoint/rewind only when the runtime provides their documented semantics. Keep decisions and evidence current.
10. After D and any required security review pass, offer the runtime's local commit path (`omp commit` on OMP or a repository-native local commit on Pi); never include a push. Ask only when a missing choice materially changes the result or permission.
11. Before final completion, load `session-lessons`. Run it once and only once for this session, then retain/learn the verified summary only when memory is available and approved.

The approval extension may block protected tool calls. Treat a block as a required user checkpoint, not as a reason to bypass the guard through another tool.
