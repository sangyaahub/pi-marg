import { expect, test } from "bun:test";

import { UNIVERSAL_WORKFLOW_POLICY } from "../core/workflow-policy";
import workflowBootstrap from "../adapters/pi/extensions/workflow-bootstrap";

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
