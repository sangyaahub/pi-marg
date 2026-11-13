# Skill routing matrix

Use one row after work type and skill mode are confirmed. Skill names are current preferred entry points; verify discovery before invoking them.

Names such as `auto-reviewer` and `auto-security-reviewer` are packaged OMP agents. On Pi, treat them as role contracts and execute them sequentially unless a compatible subagent extension is detected.

## A/B/C/D stage sequence

Implementation routes insert a verification gate after B and before D. Type 5 and high-risk changes also insert a security gate before lessons. After the required review passes: lessons/memory → optional local commit → separately approved push/merge/publication.

| Work type | Initial stages |
|---|---|
| 1 | A → C; add B → D only when implementation begins |
| 2 | A → C → B → verification → D |
| 3 | A → C → B → verification → D |
| 4 | A → B → DAP/tests/UI verification → D; add C for a non-trivial plan |
| 5 | A → C → security review; add B → verification → D → security verification for authorized fixes |
| 6 | A → C |
| 7 | A → C |

Activate the saved stage model immediately before its stage. A and C must differ; B and D must differ.

## 1 — New idea or development from scratch

| Spine | Route |
|---|---|
| Compound Engineering | `ce-brainstorm`; then `ce-plan` only when the user moves from requirements to implementation |
| Superpowers | `brainstorming`; then `writing-plans` after design approval |
| GSD | `gsd-ideate` for exploration, `gsd-spike` for feasibility, or `gsd-project` for a new multi-phase project |
| EGM | `egm-brainstorm` → `egm-draft` when the user moves from the concepts brief to a design → `egm-review` on the draft before any implementation |

Option 5 default: Compound Engineering for broad product framing; Superpowers for a focused design that will become code soon; GSD for a technical spike or a multi-milestone product; EGM when the idea needs a Goldfish-reviewed design document before any code.

## 2 — New feature in an existing repository

| Spine | Route |
|---|---|
| Compound Engineering | `ce-brainstorm` when requirements are unclear → `ce-plan` → `ce-work` → `ce-code-review` → `session-lessons`/`ce-compound` when warranted |
| Superpowers | `brainstorming` → `using-git-worktrees` when isolation helps → `writing-plans` → `test-driven-development` → `subagent-driven-development` or `executing-plans` → `requesting-code-review` → `finishing-a-development-branch` |
| GSD | `gsd-context`/onboard → `gsd-workflow` discuss → plan → execute → verify; `gsd-manage` ship only after approval |
| EGM | `egm-brainstorm` → `egm-draft` → `egm-review` (or `egm-review-loop` for chosen reviewers and standards) → user approves `design_draft.md` → B implements against it → verification → `egm-drift-report` → D |

Option 5 default: Compound Engineering for one cohesive feature; Superpowers when strict TDD and task-by-task review are the dominant need; GSD for a large feature spanning phases or milestones; EGM when design trade-offs need fresh-context review before coding.

## 3 — Improve an existing feature

| Spine | Route |
|---|---|
| Compound Engineering | `ce-optimize` for a measurable outcome, `ce-polish` for live UX refinement, or `ce-simplify-code` for settled code; finish with `ce-code-review` |
| Superpowers | `brainstorming` for the desired behavior → `writing-plans` → `test-driven-development` → execution and review skills |
| GSD | `gsd-context` → `gsd-workflow` for a scoped phase → `gsd-quality` verification/review |
| EGM | `egm-brainstorm` for the desired behavior → `egm-draft` of the change → `egm-review` → B implements → verification → `egm-drift-report` → D |

Option 5 default: Compound Engineering, because its polish, optimize, and simplify paths are specialized for improvement work.

## 4 — Proactive bug discovery or bug fix

| Spine | Route |
|---|---|
| Compound Engineering | `ce-dogfood` for browser-flow discovery, `ce-code-review` for code-level discovery, then `ce-debug` for root-cause repair and regression evidence |
| Superpowers | `systematic-debugging` → `test-driven-development` for the regression barrier → `verification-before-completion` → `requesting-code-review` |
| GSD | `gsd-quality` to route audit/debug/fix work, then `gsd-workflow` plan/execute/verify when the fix is non-trivial |
| EGM | No debugging route. Offer another spine; use `egm-review` only on a written fix plan the user asks to have reviewed |

Option 5 default: Compound Engineering for proactive discovery across user flows; Superpowers for a known reproducible defect; GSD for a bug program spanning several components. Do not let a discovery skill and a fix skill create separate competing plans.

## 5 — Security review or fixes

| Spine | Route |
|---|---|
| Compound Engineering | `ce-code-review` plus the read-only `auto-security-reviewer` and repository-native security tools; use `ce-debug` or `ce-work` only after findings are validated |
| Superpowers | `systematic-debugging` and TDD can implement a validated fix, but Superpowers is not a complete security-audit framework; add `auto-security-reviewer` and scanners |
| GSD | `gsd-quality` security/audit route → validate findings → plan fixes → execute → verify |
| EGM | No security-audit route. Offer another spine; `egm-review` may review a written fix design but never replaces `auto-security-reviewer` or scanners |

Option 5 default: GSD when its security skills are available and compatible. Otherwise use the detected security reviewer plus repository-native scanners, with Compound Engineering owning the plan and fix. For high-risk auth, secrets, money, personal data, or public-contract changes, use an independent second model family for review.

## 6 — Thoughts about an existing repository or feature

| Spine | Route |
|---|---|
| Compound Engineering | `ce-pov` for a decisive assessment, `ce-explain` for teaching, or `ce-ideate` for grounded improvements |
| Superpowers | `brainstorming` when the question should end in a proposed design; otherwise answer with read-only repository evidence |
| GSD | `gsd-context` to map facts, then the appropriate read-only context or ideation route |
| EGM | `egm-review` of an existing design document or README against the live code; `egm-drift-report` for doc/code divergence; `egm-bootstrap` writes README files, so run it only when the user asks |

Option 5 default: Compound Engineering for opinion or explanation; GSD for large-repository fact gathering; EGM for design-document review or doc/code drift.

## 7 — Business, sales, or other non-technical analysis

| Spine | Route |
|---|---|
| Compound Engineering | `ce-strategy`, `ce-pov`, or `ce-ideate`, depending on whether the output is a strategy, judgment, or option set |
| Superpowers | No default business/sales spine. Use it only if a specifically relevant installed skill exists. |
| GSD | No default business/sales spine. Do not force a software phase workflow onto non-technical analysis. |
| EGM | `egm-review-loop` with reviewers and standards chosen for the document. EGM's built-in standards target software specifications, so there is no default business/sales route. |

Option 5 default: Compound Engineering or a dedicated business/marketing/sales skill. Use web research when current market facts matter. Any publication, message, CRM write, social post, or external comment requires `post-web` approval.

## EGM stage mapping

EGM drafts and reviews documents; it does not implement code. The A/B/C/D sequence stays and maps as:

| Stage | EGM work |
|---|---|
| A | Elephant: `egm-brainstorm` and `egm-draft`, producing `concepts_brief.md` and `design_draft.md` |
| C | Goldfish plan review: `egm-review` or `egm-review-loop` on the draft. Reviewers run as fresh-context `task` subagents; without `task`, stop rather than review in the same context |
| B | Implement the user-approved design. EGM supplies no build route |
| D | Code second-eye, with `egm-drift-report` output as evidence |

- The authoritative plan is the approved design document (`design_draft.md`, saved under `docs/designs/` when the repository uses that folder). The neutral `plan.md` only indexes it.
- The plan gate is the user's approval of the design after Goldfish findings are resolved.
- EGM skills write artifacts to the working directory; record those paths in the session ledger.

## Spine ownership rules

- One family owns task state, plan, and execution checkpoints.
- A supporting reviewer or scanner from outside the spine is allowed when it creates evidence rather than a second plan.
- Do not run two brainstorming systems, two planning systems, or two shipping systems for the same task by default.
- Switching spines is a recorded decision. Preserve the old artifacts, mark them superseded, and name the new authoritative plan.
- `lfg`, GSD ship commands, and branch-finishing skills do not override approval rules. Push, PR creation/web posting, main push, and PR merge stop at their corresponding gate.
