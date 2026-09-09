---
name: session-lessons
description: Close an Auto Mode session by extracting verified, reusable lessons into Markdown exactly once. Use immediately before final completion or when `/auto-close` is invoked; do not use repeatedly during the same session.
---

# Session Lessons

Find the active Auto Mode ledger. If `lessons.md` already contains `run_count: 1`, report that lessons are already complete and do not rewrite it.

Otherwise:

1. Read `session.md`, `plan.md`, `decisions.md`, the authoritative plan, and verification/review evidence.
2. Separate observed evidence from guesses. Do not turn routine steps into durable lessons.
3. Create `lessons.md` with YAML frontmatter:

```yaml
---
run_count: 1
session_status: completed
---
```

4. Record only these useful sections:
   - Outcome and evidence.
   - What worked and should be repeated.
   - What failed or surprised us.
   - Reusable lesson or guardrail.
   - Remaining unknowns or follow-up.
5. Update `session.md` to `Lessons: complete`. Set the session status to `completed` only if the requested outcome is genuinely complete.
6. When native `learn` or Hindsight `retain` is available and the recorded context policy permits it, save only the verified reusable guardrail and material decision summary. The Markdown lesson remains the durable session record even if memory retention fails.

When Compound Engineering is the primary spine and the result contains a non-obvious repository learning, `ce-compound` may be used as the learning engine before writing this record. Do not invoke it for routine work just to satisfy ceremony. For every other case, this skill itself is the required once-per-session lesson step.

Never include secrets or unnecessary employer/client information in the lessons file.
