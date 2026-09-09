# Cost control

Spend frontier tokens where they change the decision, not on mechanical work.

```text
A  discovery      frontier, bounded context, one decision artifact
C  plan review    different frontier model, plan + risks only
B  implementation mid-layer/included model, approved plan + CodeGraph context
D  code review    different mid-layer model, diff + tests + acceptance criteria
```

Rules:

- Use `auto_model_route catalog` at selection time; never maintain a static version list.
- Prefer Cursor Composer or a zero-metered/included Cursor entry for routine B execution when quality is sufficient. “Zero-metered” does not mean unlimited or free; check plan quotas.
- Use Devin for bounded, parallelizable execution with explicit acceptance criteria and an ACU/session limit. Creating a session is a `post-web` action.
- Keep C focused on the plan, decisions, and highest-cost risks. Keep D focused on the diff, affected contracts, and test evidence.
- Use CodeGraph to retrieve surgical source context instead of sending whole directories.
- Keep Hindsight recall at `low` or 512 tokens by default. Increase only when missing memory measurably causes rework.
- Use checkpoint/rewind only around a genuinely disposable research/debug branch; its report should preserve the evidence while removing noisy transcript context.
- Keep the advisor off for routine low-risk work. When enabled, use a cheaper distinct reviewer that can catch the targeted failure mode, then verify `/advisor status` usage.
- Reuse provider prompt caches when the active Pi/OMP route supports them; keep stable instructions at the front and variable task data later.
- Escalate B or D to a frontier model only after a mid-layer attempt fails a concrete check or the change is high risk.
- Record per-stage provider, model, effort, observed outcome, and—when available—usage. Tune from real task cost, not token price alone.
