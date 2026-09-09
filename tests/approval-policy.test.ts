import { describe, expect, test } from "bun:test";

import {
  OneUseApprovals,
  approvalPolicyFromEnvironment,
  classifyInput,
  classifyToolCall,
  parseApproval,
} from "../core/approval-policy";

describe("approval policy", () => {
  test("accepts only an exact approval phrase", () => {
    expect(parseApproval("APPROVE ACTION: post-web")).toBe("post-web");
    expect(parseApproval("please APPROVE ACTION: post-web")).toBeUndefined();
    expect(parseApproval("APPROVE ACTION: unknown")).toBeUndefined();
  });

  test("classifies protected CLI actions", () => {
    expect(classifyToolCall("bash", { command: "git push origin main" })).toBe("push-main");
    expect(classifyToolCall("bash", { command: "gh pr merge 42" })).toBe("merge-pr");
    expect(classifyToolCall("bash", { command: "rm old-file.txt" })).toBe("delete-remove");
    expect(classifyToolCall("bash", { command: "git branch -D old-work" })).toBe("delete-remove");
    expect(classifyToolCall("bash", { command: "find . -name '*.tmp' -delete" })).toBe("delete-remove");
    expect(classifyToolCall("bash", { command: "gh repo delete owner/project" })).toBe("delete-remove");
    expect(classifyToolCall("bash", { command: "pi share" })).toBe("post-web");
    expect(classifyToolCall("bash", { command: "gh repo create pi-marg --public" })).toBe("post-web");
    expect(classifyToolCall("bash", { command: "vercel deploy" })).toBe("post-web");
    expect(classifyToolCall("bash", { command: "git status" })).toBeUndefined();
  });

  test("classifies share input and remote mutations", () => {
    expect(classifyInput("/share")).toBe("post-web");
    expect(classifyInput("/collab invite")).toBe("post-web");
    expect(classifyToolCall("github_create_issue", { title: "Bug" })).toBe("post-web");
    expect(classifyToolCall("github_get_issue", { number: 3 })).toBeUndefined();
  });

  test("consumes an approval once", () => {
    const approvals = new OneUseApprovals();
    approvals.grant("post-web");
    expect(approvals.consume("post-web")).toBe(true);
    expect(approvals.consume("post-web")).toBe(false);
  });

  test("uses the PiMarg environment variable first", () => {
    expect(approvalPolicyFromEnvironment({})).toBe("ask");
    expect(approvalPolicyFromEnvironment({ OMP_AUTO_MODE_APPROVAL_POLICY: "allow" })).toBe("allow");
    expect(approvalPolicyFromEnvironment({
      PIMARG_APPROVAL_POLICY: "ask",
      OMP_AUTO_MODE_APPROVAL_POLICY: "allow",
    })).toBe("ask");
  });
});
