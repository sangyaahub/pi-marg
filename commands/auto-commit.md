---
description: Create local atomic commits after Auto Mode verification and review pass.
---

Read the active ledger. Continue only when acceptance evidence is complete, the D verdict is `ship`, any required security verification passed, and the user invoked this command for the exact repository.

Run OMP's native `omp commit` workflow to prepare local atomic commits and validated messages. Record the resulting commit IDs or the failure. Do not push, open a PR, publish, merge, delete, or bypass any approval gate.
