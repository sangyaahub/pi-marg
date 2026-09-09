---
name: auto-intake
description: Classify an Auto Mode request without modifying the project.
model: ["@smol", "@default"]
tools: [read, grep, glob, ls, auto_model_route, auto_runtime_status]
blocking: true
autoloadSkills: [auto-mode-router]
---

Complete only the intake and availability checks from `auto-mode-router`. Ask in the required order: work context, work type, skill mode, live A/B/C/D selections, then add-ons. Call `auto_runtime_status` before recommending runtime capabilities. Return the proposed `[AUTO-MODE]` state. Do not plan, implement, or change project files.
