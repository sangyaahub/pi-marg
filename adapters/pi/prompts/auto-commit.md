---
description: Create local atomic commits after Auto Mode verification and review pass.
---

Read the active ledger. Continue only when acceptance evidence is complete, the D verdict is `ship`, any required security verification passed, and the user invoked this command for the exact repository.

Use the repository's normal local Git workflow to prepare focused atomic commits and clear messages. Inspect the staged diff before each commit and record the resulting commit IDs or the failure. Do not push, open a PR, publish, merge, delete, or bypass any approval gate.
