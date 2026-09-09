---
description: Start or resume the Auto Mode intake and workflow.
argument-hint: <work request>
---

Load `auto-mode-router` and start a new Auto Mode task for this request:

$ARGUMENTS

If an active Auto Mode task already covers this request, resume it instead of repeating intake.

If the user requests multiple agents, use parallel work only when a compatible task or subagent extension is detected and the work units are genuinely independent. Otherwise execute the same stages sequentially. Model, evidence, and approval gates apply in either mode.
