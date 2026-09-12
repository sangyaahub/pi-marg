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
omp models
```

The OMP adapter reads `ctx.models.list()`, which supplies authenticated and enabled models, and activates an exact catalog entry with `pi.setModel()`.

## Selection workflow

1. Run `/pi-marg` for the full native intake, or `/auto-models choose` to change saved models.
2. Confirm the work type so PiMarg knows which stages are required.
3. For each required stage, choose a **provider** first (numbered `1. …`), then a **model** from that provider (numbered `1. …`). Exact `provider/id` selectors are the selection keys—not display numbers alone.
4. Select A and C when discovery/review is required; recommended frontier choices appear first within their lists.
5. Select B and D when implementation is required; recommended execution choices appear first within their lists.
6. Resolve any A=C or B=D identity conflict before continuing.
7. Activate the saved selector immediately before its stage.

### Tool form (`auto_model_route`)

```text
# 1) Overview: every provider, no model dump
auto_model_route action=catalog workType=<n>

# 2) Full model list for one authenticated provider
auto_model_route action=catalog workType=<n> provider=<provider-name>

# 3) Persist and activate an exact selector
auto_model_route action=select stage=<A|B|C|D> target=<provider>/<model-id> workType=<n>
```

Never present a hand-curated subset that omits a logged-in provider. Every authenticated and enabled runtime model remains selectable at every required stage. The preferred classes above control ranking, not visibility.

The normalized identity check treats the same underlying model reached through different providers as the same candidate when their identifiers normalize equally.

### OMP cursor → openai-codex note

On OMP with `@oh-my-pi/pi-coding-agent` 18.1.17, switching from a `cursor` stage to an `openai-codex` stage in the **same** session can fail if prior `cursor-agent` tool ids are replayed (`call_id` longer than 64). PiMarg surfaces this as a catalog advisory when both providers are live. Workaround: start a **fresh session** that does not replay the affected tool history. The durable fix belongs in the harness, not in PiMarg selectors.

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
