# Pi runtime integration

Read this reference only when `auto_runtime_status` reports `runtime: Pi`. The shared A/B/C/D contract remains authoritative; optional OMP conveniences do not become imaginary Pi features.

## Execution shape

```text
A model → discovery record
   ↓ switch model
C model → independent plan review
   ↓ accepted plan
B model → implementation and tests
   ↓ switch model
D model → independent read-only review
```

Pi can perform this sequentially in one session with `auto_model_route`. Parallel work is allowed only when `task` or another compatible subagent extension is actually detected. Do not simulate a swarm in prose.

## Models

- The Pi adapter uses the session's scoped models when configured; otherwise it uses the authenticated available registry.
- Activate the saved exact selector before every A/B/C/D stage.
- If activation fails, stop the stage and ask the user to repair authentication or select another catalog entry.
- C never edits the plan silently; it returns a verdict and required revisions. D remains read-only.

## Code intelligence

Upstream Pi provides file and shell primitives; LSP, AST, CodeGraph, browser, debugger, and security tools depend on installed extensions or repository commands.

- Use `codegraph_explore` when detected.
- Otherwise, use an installed CodeGraph CLI through `bash` after `setup-codegraph.sh` has been explicitly applied.
- If neither exists, use exact repository-native language/compiler tools and label repository-wide impact as not verified.
- Do not replace architecture analysis with broad grep output.

## Review and verification

- If a `review` command exists, it may host the C/D contract; otherwise run the selected reviewer model sequentially.
- Every implementation still runs focused tests and the narrowest broader check protecting affected contracts.
- Use browser, debugger, or security extensions only when `auto_runtime_status` detects them.
- Record unavailable surfaces as `not verified`, including the practical consequence.

## Context and memory

Pi may provide compaction and session branching, but OMP `checkpoint`/`rewind` semantics are not assumed. Keep durable state in the Markdown ledger before compacting.

Persistent memory is off unless the tool inventory exposes an approved memory integration such as `recall`/`retain`. Always write `lessons.md` first. Never retain secrets, credentials, client data, personal data, or unvalidated hypotheses.

## Commit and sharing

- After D passes, offer a local repository-native commit only when the user requests it. Never push with that step.
- `/share`, `pi share`, GitHub mutations, external Devin session creation, and other publication remain protected `post-web` actions.
- Pi package extensions execute with local user permissions; the approval guard is not an OS sandbox.
