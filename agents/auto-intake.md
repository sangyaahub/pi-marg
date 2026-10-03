---
name: auto-intake
description: Classify an Auto Mode request without modifying the project.
model: ["@smol", "@default"]
tools: [read, grep, glob, ls, ask, auto_model_route, auto_runtime_status]
blocking: true
autoloadSkills: [auto-mode-router]
---

Complete only the intake and availability checks from `auto-mode-router`. Ask in the required order: work context, work type, skill mode, live A/B/C/D selections, high and low runtime backups, then add-ons. Ask work context, work type, and skill mode with the host selection tool, one stage at a time. Call `auto_runtime_status` before recommending runtime capabilities. Return the proposed `[AUTO-MODE]` state. Do not plan, implement, or change project files.
