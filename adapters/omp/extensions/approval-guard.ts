import {
  OneUseApprovals,
  approvalInstruction,
  approvalPolicyFromEnvironment,
  classifyInput,
  classifyToolCall,
  parseApproval,
} from "../../../core/approval-policy";

export default function approvalGuard(pi: any) {
  const approvals = new OneUseApprovals();
  const clear = () => approvals.clear();

  pi.on("session_start", clear);
  pi.on("session_switch", clear);
  pi.on("session_branch", clear);

  pi.on("input", async (event: any, ctx: any) => {
    if (event.source === "extension") return;
    const granted = parseApproval(event.text);
    if (granted) {
      approvals.grant(granted);
      if (ctx.hasUI) ctx.ui.notify(`One ${granted} action is approved for this session.`, "warning");
      return;
    }

    const action = classifyInput(event.text);
    if (!action || approvalPolicyFromEnvironment() === "allow") return;
    if (approvals.consume(action)) return;
    if (ctx.hasUI) ctx.ui.notify(`Blocked ${event.text.trim()}. Approve once with: ${approvalInstruction(action)}`, "warning");
    return { handled: true };
  });

  pi.on("tool_call", async (event: any) => {
    if (approvalPolicyFromEnvironment() === "allow") return;
    const action = classifyToolCall(event.toolName, event.input);
    if (!action || approvals.consume(action)) return;
    return {
      block: true,
      reason: `PiMarg blocked a protected ${action} action. Show the exact action and consequence, then ask for exactly:\n${approvalInstruction(action)}\nThe approval permits one matching call only.`,
    };
  });
}
