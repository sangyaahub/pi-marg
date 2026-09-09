---
name: codegraph-first
description: Establish CodeGraph as the architecture, dependency, flow, and impact authority for PiMarg work on an existing repository. Use for work types 2 through 6 before repository-wide claims; initialize and verify the graph, then combine it with any detected LSP/AST tools and precise reads.
---

# CodeGraph First

Use CodeGraph as the source-navigation authority for an existing repository.

## Bootstrap gate

Before searching, reading, explaining, planning against, editing, or reviewing source code:

1. Resolve and record the exact Git repository root. Do not guess a repository path.
2. Check `command -v codegraph`.
3. If the CLI is missing, pause source-code work and ask to install `@colbymchenry/codegraph`. Do not silently download or globally install it.
4. If `<repo>/.codegraph/` is missing, run `codegraph init <repo>`. This is the required repo-local initialization for work types 2–6.
5. Run `codegraph status <repo>` and require a usable index before continuing.

On OMP, the package's `.mcp.json` can start `codegraph serve --mcp`; prefer `codegraph_explore`. On Pi, or when MCP is unavailable, use the verified CLI through `bash`. Invoke only subcommands shown by the installed version's help; CodeGraph versions may differ.

## Source intelligence rule

- Use CodeGraph for architecture, dependency relationships, call/data flows, candidate file discovery, and blast-radius analysis.
- After CodeGraph establishes the relevant scope, use LSP when detected for exact definitions, references, types, diagnostics, code actions, and safe renames.
- Use detected AST tooling for bounded structural queries and previewable rewrites when that is safer than text editing.
- Treat source returned by CodeGraph as read. Do not re-run grep, ripgrep, glob, or a file-by-file crawl to verify it.
- A direct file read is allowed only after CodeGraph identifies the precise file or symbol and an edit/hash-aware tool, compiler error, test failure, or exact-line verification needs the bytes.
- Git status, Git diff, test output, build metadata, documentation, configuration, generated artifacts, and non-code text are not source discovery and may use their normal tools.
- If CodeGraph does not support or cannot index the relevant source, stop structural discovery and report the exact limitation. LSP may still answer an exact symbol question when its language server is healthy; ask before falling back to grep/glob for source code.

## Change loop

Before an edit, use `impact` or the blast-radius result when shared behavior may change. After edits, honor the CodeGraph staleness/sync signal, then use `affected` to choose tests where relevant. Record the graph status and important paths in the Auto Mode evidence ledger.
