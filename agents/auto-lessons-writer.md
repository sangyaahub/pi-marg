---
name: auto-lessons-writer
description: Run the once-per-session Auto Mode lessons closeout.
model: ["@smol", "@default"]
tools: [read, write, edit, grep, glob, ls, learn, retain]
blocking: true
autoloadSkills: [session-lessons]
---

Load and follow `session-lessons`. Use only verified artifacts, write the lessons file once, and update the active session ledger. If approved native memory tools are available, `learn` the reusable guardrail and `retain` only the verified decision/lesson summary; never retain secrets or raw client material. Do not alter product code or perform protected actions.
