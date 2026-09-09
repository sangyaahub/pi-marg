import { UNIVERSAL_WORKFLOW_POLICY } from "../../../core/workflow-policy";

export default function workflowBootstrap(pi: any) {
  pi.on("before_agent_start", (event: any) => ({
    systemPrompt: `${String(event.systemPrompt ?? "")}\n\n${UNIVERSAL_WORKFLOW_POLICY}`,
  }));
}
