import { describe, expect, test } from "bun:test";

import { buildRuntimeCapabilityReport, normalizeCapabilityNames } from "../core/runtime-capabilities";

describe("runtime capability report", () => {
  test("normalizes string and named capabilities", () => {
    expect(normalizeCapabilityNames(["bash", { name: "task" }, {}, null])).toEqual(["bash", "task"]);
  });

  test("reports detected Pi tools and honest fallbacks", () => {
    const report = buildRuntimeCapabilityReport("Pi", ["task", "recall"], [], false);
    expect(report.tools.task).toBe(true);
    expect(report.tools.codegraph_explore).toBe(false);
    expect(report.notes.join(" ")).toContain("OMP Advisor is not native to Pi");
    expect(report.memory.configured).toBe(false);
  });

  test("reports configured OMP memory", () => {
    const report = buildRuntimeCapabilityReport(
      "OMP",
      ["codegraph_explore", "recall", "retain", "reflect", "learn"],
      ["advisor", "review"],
      true,
    );
    expect(report.memory).toEqual({ configured: true, recall: true, retain: true, reflect: true, learn: true });
    expect(report.commands.advisor).toBe(true);
  });
});
