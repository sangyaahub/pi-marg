# Intake and session state

## State machine

```text
NEW
 │
 ▼
CONTEXT ─► TYPE ─► SKILL MODE ─► MODELS ─► RUNTIME ─► ADD-ONS ─► READY
            ▲                                                   │
            └────────────────── clarify only ◄──── ACTIVE ◄─────┘
                                                        │
                                                        ▼
                                                      CLOSED
```

Ask one intake stage at a time. A clear user prompt can support a proposed classification, but it does not remove the required confirmation.

## Stage 1 — work context

Ask first with numbered options:

> Is this for your job/client, or is it personal work?
>
> 1. Job/client
> 2. Personal

Record exactly one canonical value (`job-client` or `personal`); numbering is presentation-only:

- `job-client`: Do not add Sangyaa branding, name, logo, metadata, footer, or promotional language. Use the employer/client/project brand already in scope.
- `personal`: Existing project branding wins. Sangyaa branding is opt-in, never automatic.

Do not start code, research, or planning before this answer unless the user is asking only how Auto Mode itself works.

## Stage 2 — work type

Infer the most likely type, state it plainly, and ask the user to confirm. If ambiguous, show the relevant choices only.

1. New idea or development from scratch: brainstorming and analysis.
2. New feature for an existing repository.
3. Improve an existing feature in an existing repository.
4. Proactive bug discovery or bug fix in an existing repository.
5. Security review or security fixes.
6. Thoughts, explanation, or another question about an existing repository or feature.
7. Business, sales, or other non-technical analysis.

If one request contains multiple types, pick the type that owns the immediate outcome and record later types as follow-on phases. Do not open multiple workflow spines.

## Stage 3 — skill mode

Ask:

> Which method should own this task: 1) Compound Engineering, 2) Superpowers, 3) GSD Core, or 4) choose the best one for me?

- Mode 1: use the Compound Engineering mapping for the confirmed work type.
- Mode 2: use the Superpowers mapping.
- Mode 3: first verify that GSD skills and their required tools are available in the active runtime. If not, explain the incompatibility and offer a supported alternative.
- Mode 4: choose one primary spine using the routing criteria. Explain the choice in one short sentence and ask for confirmation only if the trade-off is material.

## Stage 4 — live model choices

Call `auto_model_route` with `action: catalog` and the confirmed work type. Present only selectors returned by the tool; do not type a remembered model ID.

Catalog presentation is provider-first:

1. Show **every** authenticated provider as numbered options `1.`, `2.`, … (including Devin when present). Never omit a logged-in provider and never curate down to Claude/Codex/Cursor only.
2. After the user picks a provider, call `auto_model_route` again with the same work type and `provider=<name>` so the tool lists **every** model for that provider as numbered `1.`, `2.`, …
3. Ask the user with those numbered labels. If the option UI cannot fit the full list, paste the numbered list into the question text and accept the number or exact selector.

Interactive `/pi-marg` uses the same provider → model two-step with numbered labels.

The four roles are:

- A — thinking/discovery using a current Claude Fable/Opus, OpenAI Astra/Sol, or Grok 4.6-or-newer frontier model.
- B — coding/execution using a current Claude or OpenAI mid-layer model, Cursor Composer, a zero-metered Cursor/Devin route, native Devin SWE, or an external Devin MCP session.
- C — plan second-eye using the A frontier pool, but not the same underlying model selected for A.
- D — implementation/code second-eye using the B execution pool, but not the same underlying model selected for B.

Ask only for stages required by the current work type. Work types 2–3 normally use A → C → B → D. Type 4 uses A → B → D and adds C only for a non-trivial plan. Types 1, 6, and 7 use A → C. Type 5 uses A → C for review and adds B → D when fixes are authorized.

Use `action: select` for each answer with the **exact selector** string (for example `devin/swe-2`), not the display number alone. The active adapter saves exact selectors in session state and immediately activates the selected runtime model. Native `devin/swe-*` selectors behave like other models. An external Devin session requires `post-web` approval before creation.

## Stage 5 — native runtime and supporting capabilities

Call `auto_runtime_status` before making a recommendation. Distinguish `available`, `enabled`, and `used`; a tool installed but gated off did not run.

For an existing repository, CodeGraph is mandatory. Verify the CLI and graph before any source reference.

Offer a compact recommended set and let the user change it:

- Orchestration: serial, direct `task` batch, or explicit `workflowz`; recommend serial for small/overlapping changes and task fan-out only for independent units.
- Advisor: off or supplemental watcher; recommend it for moderate/high-risk work when a distinct model is configured and its extra usage is acceptable. It never replaces C/D.
- Context pruning: use checkpoint/rewind only for a long disposable research or debugging branch, and only when both tools are available.
- Ponytail: off, lite, or full; recommend full for normal B implementation and `ponytail-review` before D correctness review.
- Memory: off, detected local memory, Hindsight recall-only, or Hindsight recall-and-retain; default job/client work to off until retention is permitted.
- Language skills: automatically detect Go, Python, and TypeScript in the actual scope, then load only installed relevant skills.
- Cost posture: economy, balanced, or quality; recommend balanced unless risk or user intent says otherwise.
- Verification: infer repository checks, DAP debugging, browser/desktop QA, and security review from the work type and affected surface. Let the user remove only gates whose consequence is understood.
- Collaboration: off by default. `/collab` and `/share` require `post-web` approval.

## Session reuse

After intake, emit a compact conversational state block and save the same facts in the ledger:

```text
[AUTO-MODE]
context: job-client | personal
type: 1..7
mode: 1..4
spine: compound-engineering | superpowers | gsd | none
models: A=<selector> B=<selector|n/a> C=<selector> D=<selector|n/a>
runtime: advisor=<off|available|on|unavailable> orchestration=<serial|task|workflowz> checkpoint=<off|available|used>
addons: ponytail=<off|lite|full> memory=<off|local|hindsight-recall|hindsight-retain> language=<names|none> cost=<economy|balanced|quality>
verification: tests=<planned|n/a> dap=<planned|n/a> ui=<browser|desktop|n/a> security=<planned|n/a>
collaboration: off | view-approved | write-approved
commit: not-ready | offered | created | skipped
codegraph: n/a | pending | ready | blocked
status: ready | active | blocked | completed | superseded
phase: intake | analysis | plan | build | verify | review | security | lessons | commit
ledger: <path>
```

Reuse this state for normal follow-ups. Start over only when the user explicitly resets it or introduces a materially different outcome.

## Availability check

Before declaring the task ready:

- Confirm the chosen skill appears in the active runtime's discovered skill inventory.
- Confirm any required tool or agent exists before dispatch.
- Call `auto_runtime_status` and record the exact optional capabilities that are available now.
- Confirm the repository exists for work types 2–6.
- For work types 2–6, load `codegraph-first`, verify the CLI, initialize `.codegraph/` if needed, and record `codegraph: ready` before source work.
- If a repository is missing, ask for its path; do not create or guess one.
- If a skill family is absent, offer installation instructions or a supported family. Never silently substitute while retaining the unavailable family's name.
