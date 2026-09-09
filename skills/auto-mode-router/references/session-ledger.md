# Session ledger

Every Auto Mode task keeps durable Markdown records.

## Location

Default:

```text
.agent-work/sessions/<YYYY-MM-DD>-<short-task-slug>/
├── session.md
├── plan.md
├── decisions.md
├── lessons.md       # created once at close
└── evidence/        # only when the repo has no equivalent evidence location
```

Follow an existing repository convention when it provides an equivalent location. If the working directory is not writable, ask the user for an artifact directory rather than losing the ledger.

## One source of planning truth

The selected workflow family's native plan remains authoritative:

- Compound Engineering: its generated brainstorm/plan document.
- Superpowers: its generated design/implementation plan.
- GSD: `.planning/` state and phase plans.
- No technical spine: `plan.md` in the neutral session folder.

The neutral `plan.md` is an index when a native plan exists. It records the goal, acceptance criteria, current phase, and a link/path to the authoritative plan; it does not duplicate the full plan.

## `session.md`

Record:

```markdown
# Auto Mode Session

- Status: ready | active | blocked | completed | superseded
- Work context: job-client | personal
- Branding: client-project-only | existing-project-opt-in
- Work type: 1..7 — <label>
- Skill mode: 1..4
- Primary spine: compound-engineering | superpowers | gsd | none
- Current phase: intake | analysis | plan | build | verify | review | security | lessons | commit
- Authoritative plan: <path or none>
- Stage A model: <exact live selector>
- Stage B model: <exact live selector or n/a>
- Stage C model: <exact live selector>
- Stage D model: <exact live selector or n/a>
- Model separation: A != C; B != D
- CodeGraph: n/a | pending | ready | blocked
- Runtime: advisor=<off|available|on|unavailable>; orchestration=<serial|task|workflowz>; checkpoint=<off|available|used>
- Add-ons: Ponytail=<setting>; memory=<off|local|hindsight-recall|hindsight-retain>; language skills=<names or none>; cost=<posture>
- Verification: tests=<state>; DAP=<state>; UI=<browser|desktop|n/a and state>; security=<state>
- Review verdict: pending | ship | block
- Collaboration: off | view-approved | write-approved
- Commit: not-ready | offered | created | skipped
- Approval policy: ask
- Lessons: pending | complete
```

Append a short evidence index as the work progresses, including unavailable or skipped verification gates and their consequence. Do not store secrets, credentials, private tokens, or unnecessary personal/client data.

## `decisions.md`

Use stable IDs:

```markdown
## D-001 — <decision>

- Status: proposed | confirmed | superseded
- Reason: <why>
- Consequence: <what this changes>
- Source: user | repository | evidence-backed recommendation
```

Record material product, architecture, security, scope, model, skill-spine, and approval decisions. Do not fill the file with routine implementation details already obvious from code.

## `plan.md`

At minimum record:

- user-visible goal;
- acceptance evidence;
- highest-cost failure modes;
- ordered phases or link to the authoritative native plan;
- verification and review gates;
- protected external actions still requiring approval.

## Completion

Only set `Status: completed` when acceptance evidence exists and `lessons.md` has `run_count: 1`. A clean Git tree alone is not completion evidence.
