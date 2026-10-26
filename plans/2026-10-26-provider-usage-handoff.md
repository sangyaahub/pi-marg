# Provider list, remaining usage, and 95% handoff

Date: 2026-10-26
Status: proposed for Stage C review
Spine: compound-engineering (`ce-plan`)
Confirmed product intent:

- Kimi is a normal provider in the logged-in provider list.
- Every logged-in provider shows how much usage is still left.
- At 95% usage, the current run pauses and the working context is saved.
- Work resumes on another logged-in provider and model of the same capability.

## Current behavior

`core/model-routing.ts` builds the provider list from the live runtime catalog through `uniqueProviders` and `formatCatalogPresentation`. There is no hardcoded provider allowlist and no Kimi-specific entry. A provider appears only when the active Pi or OMP registry already contains it.

Failover is reactive. `USAGE_LIMIT_PATTERNS` matches quota-exhausted error text. `executeAutomaticFailover` then activates the saved high backup, then the low backup, and tells the session to resume the same stage from the last safe point. It does not read a remaining-usage percentage, does not pause at 95%, and does not choose the next model by matching stage capability beyond the two preselected backups.

Custom providers can be written into `models.yml` by `core/provider-config.ts`. That path is generic OpenAI-compatible setup. It does not ship a Kimi preset and it does not store usage.

## Implementation approach

1. Keep the catalog live. Do not replace it with a fixed Claude/Codex/Cursor list. Add a Kimi setup preset only as an optional `models.yml` block (provider id, display name, base URL, env var, model ids) that uses the existing `writeCustomProvider` validation. Authenticated Kimi models must show up in the numbered provider list with every other logged-in provider.
2. Add a usage snapshot per logged-in provider: provider id, percent used, source, and timestamp. Show it next to that provider during catalog selection and in the session ledger when a route is active.
3. Treat 95% used as a planned pause for the active provider. Before switching, write the current stage, selector, and ledger path so the next model can resume the same stage. Do not restart intake.
4. Choose the resume target from logged-in models that fit the active stage pool (A/C frontier, or B/D execution), excluding the provider that just crossed 95% and any selector already exhausted in this stage. Use the saved high backup first when it still fits and has usage under 95%. Otherwise use the saved low backup on the same rule. If neither fits, stop and ask instead of switching to a different capability.
5. Keep the existing error-text failover for a hard quota failure that happens before a percentage is known.

## Verification

- Catalog tests: a logged-in Kimi provider is numbered with the other providers and is not dropped by presentation.
- Routing tests: at 95% the active provider pauses, state is persisted, and the next selector is a same-stage model on a different provider.
- Routing tests: missing usage data does not trigger the 95% pause; only a matched quota error uses the existing failover.
- Routing tests: if no same-capability model is under 95%, the run stops without activating a weaker or different-role model.

## Open constraint

This repository does not currently read remaining quota from Pi, OMP, or Kimi. The 95% pause cannot be honest until a runtime or provider usage response supplies a percentage. The plan does not invent that API. Stage B must use a real usage field if one exists in the host, or record the gate as blocked rather than guessing usage from errors.

## Out of scope

Push, sharing, and writing API keys into the plan or ledger. Replacing the A/B/C/D model separation. Treating ordinary errors or temporary throttles as quota exhaustion.
