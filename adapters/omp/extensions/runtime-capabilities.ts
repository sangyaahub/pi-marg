import {
  buildRuntimeCapabilityReport,
  normalizeCapabilityNames,
} from "../../../core/runtime-capabilities";

function response(report: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }], details: report };
}

export default function runtimeCapabilities(pi: any) {
  const z = pi.zod;
  pi.registerTool({
    name: "auto_runtime_status",
    label: "PiMarg Runtime Status",
    description: "Detect OMP tools, commands, and memory hooks before routing optional workflow stages.",
    parameters: z.object({}),
    async execute(_toolCallId: string, _params: unknown, _signal: unknown, _onUpdate: unknown, ctx: any) {
      const tools = normalizeCapabilityNames(pi.getAllTools?.() ?? []);
      const commands = normalizeCapabilityNames(pi.getCommands?.() ?? []);
      const memoryConfigured = Boolean(ctx.memory) || tools.some((name) => ["recall", "retain", "reflect", "learn"].includes(name));
      return response(buildRuntimeCapabilityReport("OMP", tools, commands, memoryConfigured));
    },
  });
}
