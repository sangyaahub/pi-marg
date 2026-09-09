# Model setup

PiMarg reads the active Pi or OMP model registry whenever `auto_model_route` runs. Exact selectors are deliberately absent from this document because providers rename and replace models.

```text
LIVE AUTHENTICATED CATALOG
            │
     ┌──────┴──────┐
     ▼             ▼
 frontier       execution
   A / C          B / D
     │             │
     └─ different ─┘ within each pair
```

## Roles

| Stage | Purpose | Preferred class |
|---|---|---|
| A | Discovery and difficult reasoning | Latest eligible Claude frontier, OpenAI frontier, or Grok frontier |
| C | Independent plan review | A different frontier model/family from A |
| B | Execute the accepted plan | Claude/OpenAI mid-layer, Cursor Composer, eligible zero-metered route, or Devin SWE |
| D | Independent implementation review | A different execution model/family from B |

“Zero-metered” means the runtime reports zero token price for that route. Subscription quotas and pool limits can still apply.

## Pi Agent

Use Pi's normal provider configuration or environment variables, then verify availability with:

```bash
pi --list-models
```

The Pi adapter reads `ctx.scopedModels` when the session has a model allowlist; otherwise it reads `ctx.modelRegistry.getAvailable()`. This respects both authentication and an intentional session scope.

## Oh My Pi

Use OMP `/login`, then inspect `/model` or:

```bash
omp models list
```

The OMP adapter reads `ctx.models.list()` and activates an exact catalog entry with `pi.setModel()`.

## Selection workflow

1. Run `/auto-models choose`.
2. Request `action: catalog` with the confirmed work type.
3. Select A and C from frontier candidates.
4. Select B and D when implementation is required.
5. Resolve any A=C or B=D identity conflict before continuing.
6. Activate the saved selector immediately before its stage.

The normalized identity check treats the same underlying model reached through different providers as the same candidate when their identifiers normalize equally.

## Devin

Native Devin model entries are ordinary B/D candidates when the runtime catalog exposes them. A separate external Devin session appears only when a Devin tool is detected. Creating that session is a web mutation and requires one-use `post-web` approval.

## Advisor and supplemental reviewers

The selected C and D models are the authoritative reviewers. OMP Advisor, a Pi reviewer extension, or another watcher may supplement them only when detected; it must not replace the distinct-model contract.

## Cost defaults

- Give A one bounded discovery pass.
- Give C the plan, acceptance criteria, assumptions, and risks—not the whole repository.
- Use a capable mid-layer or included route for routine B execution.
- Give D the diff, CodeGraph impact, decisions, and test evidence.
- Escalate B or D to a frontier model only after concrete failure or for genuinely high-risk work.
- Record model, stage, outcome, and available usage data so optimization measures cost per accepted result.
