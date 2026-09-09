---
description: Verify and close the active Auto Mode session.
---

For the active Auto Mode session:

1. Check the acceptance evidence, conditional verification gates, D verdict, and any required security verification. List anything not verified and its consequence.
2. Load and run `session-lessons` unless its `run_count` is already `1`. Use native learn/retain only when available and approved.
3. Offer `/auto-commit` only when the review verdict is `ship`; do not create a commit automatically during close.
4. Update the session ledger to `completed` only if the requested outcome is actually complete; otherwise leave it `active` or mark it `blocked` with the reason.
5. Do not perform any protected action as part of closing the session.
