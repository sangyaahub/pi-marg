# Ponytail integration

Ponytail is a supporting minimalism filter, not the task's planner.

## Recommended placement

```text
Stage A: understand the real need and code flow
    ↓
Ponytail lite: challenge speculative scope or a new dependency
    ↓
Stage B: Ponytail full while implementing the approved slice
    ↓
tests pass
    ↓
Stage D: ponytail-review on the diff, then normal correctness review
```

Use CodeGraph first on an existing repository. Ponytail's ladder runs only after the relevant flow is understood:

1. Skip a requirement that is genuinely unnecessary.
2. Reuse an existing repository pattern.
3. Prefer the standard library.
4. Prefer a native platform feature.
5. Prefer an already-installed dependency.
6. Write the minimum correct code.

Keep `full` as the normal build setting. Use `lite` during architecture when the user should choose between the requested design and a smaller option. Avoid `ultra` for authentication, authorization, money, personal/client data, destructive behavior, concurrency, or migrations.

Never remove trust-boundary validation, data-loss handling, security controls, accessibility, acceptance behavior, or the smallest useful regression test. `ponytail-review` finds complexity only; it does not replace correctness or security review.

## Installation

Ponytail publishes a Claude-compatible marketplace and a Pi package. For OMP's Claude-marketplace compatibility path:

```bash
omp plugin marketplace add DietrichGebert/ponytail
omp plugin install --scope user ponytail@ponytail
```

Restart OMP and verify `ponytail` plus `ponytail-review` appear. If the installed OMP release does not discover the compatibility package, use Ponytail's documented Pi install for the Pi harness or copy its instruction-only `AGENTS.md` policy; do not claim the OMP skill loaded until discovery succeeds.
