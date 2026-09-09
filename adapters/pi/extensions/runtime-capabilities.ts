import { Type } from "typebox";

import {
  buildRuntimeCapabilityReport,
  normalizeCapabilityNames,
} from "../../../core/runtime-capabilities";

function response(report: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }], details: report };
}

export default function runtimeCapabilities(pi: any) {
  pi.registerTool({
    name: "auto_runtime_status",
    label: "PiMarg Runtime Status",
    description: "Detect Pi tools, commands, and memory hooks before routing optional workflow stages.",
    parameters: Type.Object({}),
    async execute() {
      const tools = normalizeCapabilityNames(pi.getAllTools?.() ?? []);
      const commands = normalizeCapabilityNames(pi.getCommands?.() ?? []);
      const memoryConfigured = tools.some((name) => ["recall", "retain", "reflect", "learn"].includes(name));
      return response(buildRuntimeCapabilityReport("Pi", tools, commands, memoryConfigured));
    },
  });
}
