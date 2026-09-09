---
description: Show Pi capabilities available to the active Auto Mode workflow.
argument-hint: [status | advisor | memory | context]
---

Load `auto-mode-router`, read its native Pi runtime reference, and call `auto_runtime_status`.

- With no argument or `status`, report available tools/commands, active memory, and exact fallbacks without changing configuration.
- With `advisor`, report whether a compatible advisor or watcher extension is detected. Keep C/D as the authoritative reviewers.
- With `memory`, show the approved context-specific local/Hindsight route. Never expose or write a token.
- With `context`, report whether checkpoint/rewind is detected and use it only around one disposable exploration branch.

Update the runtime fields in the ledger only after observing the actual state.
