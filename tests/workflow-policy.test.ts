import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";

import { UNIVERSAL_WORKFLOW_POLICY } from "../core/workflow-policy";
import workflowBootstrap from "../adapters/pi/extensions/workflow-bootstrap";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readProject(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("the universal bootstrap preserves the workflow's mandatory contracts", () => {
  expect(UNIVERSAL_WORKFLOW_POLICY).toContain("auto-mode-router");
  expect(UNIVERSAL_WORKFLOW_POLICY).toContain("job/client versus personal");
  expect(UNIVERSAL_WORKFLOW_POLICY).toContain("A different from C");
  expect(UNIVERSAL_WORKFLOW_POLICY).toContain("B different from D");
  expect(UNIVERSAL_WORKFLOW_POLICY).toContain("protected-action approvals");
});

test("the Pi bootstrap appends the policy before an ordinary agent turn", () => {
  let handler: ((event: { systemPrompt: string }) => { systemPrompt: string }) | undefined;
  workflowBootstrap({
    on(event: string, callback: typeof handler) {
      expect(event).toBe("before_agent_start");
      handler = callback;
    },
  });
  const result = handler?.({ systemPrompt: "Pi base prompt" });
  expect(result?.systemPrompt).toStartWith("Pi base prompt");
  expect(result?.systemPrompt).toContain(UNIVERSAL_WORKFLOW_POLICY);
});

test("intake stages 1-3 require the host selection tool, not typed numbers", () => {
  const intakeAgent = readProject("agents/auto-intake.md");
  const toolsLine = intakeAgent.split("\n").find((line) => line.startsWith("tools:"));
  expect(toolsLine).toContain("ask");

  const intakeGuide = readProject("skills/auto-mode-router/references/intake-and-state.md");
  expect(intakeGuide).toContain("## How to ask");
  expect(intakeGuide).toContain("Do not print the choices as a numbered chat list");
  expect(intakeGuide).not.toContain("Ask first with numbered options");

  const autoRule = readProject("rules/auto-mode.md");
  expect(autoRule).toContain("host selection tool (`ask` on OMP)");
  expect(autoRule).toContain("Do not ask the user to type a number");
});

