---
description: Run the required Auto Mode plan or implementation review with the saved independent model.
argument-hint: [plan | code]
---

Load `auto-mode-router` and the native OMP runtime reference.

- `plan`: activate Stage C, review the authoritative plan and highest-cost risks, then record the verdict.
- `code` or no argument: require verification evidence, activate Stage D, and run `auto-reviewer`. If native `/review` is available, its P0–P3/confidence/verdict contract is preferred; otherwise reproduce that contract with read-only `task` fan-out.

Never fix findings in the review pass. A block verdict returns to planning or B with a recorded countermeasure.
