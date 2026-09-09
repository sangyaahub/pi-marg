import type { RuntimeName } from "./model-routing";

export interface RuntimeCapabilityReport {
  runtime: RuntimeName;
  tools: Record<string, boolean>;
  commands: Record<string, boolean>;
  memory: {
    configured: boolean;
    recall: boolean;
    retain: boolean;
    reflect: boolean;
    learn: boolean;
  };
  notes: string[];
}

export const TOOL_CAPABILITIES = [
  "codegraph_explore",
  "lsp",
  "ast_grep",
  "ast_edit",
  "task",
  "checkpoint",
  "rewind",
  "debug",
  "security_scan",
  "eval",
  "browser",
  "computer",
  "recall",
  "retain",
  "reflect",
  "learn",
] as const;

export const COMMAND_CAPABILITIES = ["advisor", "review", "memory", "collab", "share"] as const;

export function normalizeCapabilityNames(items: unknown[]): string[] {
  return items
    .map((item: any) => (typeof item === "string" ? item : String(item?.name ?? "")))
    .filter(Boolean);
}

export function buildRuntimeCapabilityReport(
  runtime: RuntimeName,
  toolNames: string[],
  commandNames: string[],
  memoryConfigured: boolean,
): RuntimeCapabilityReport {
  const tools = new Set(toolNames.map((name) => name.trim().toLowerCase()));
  const commands = new Set(commandNames.map((name) => name.trim().toLowerCase().replace(/^\//, "")));
  const toolStatus = Object.fromEntries(TOOL_CAPABILITIES.map((name) => [name, tools.has(name)])) as Record<string, boolean>;
  const commandStatus = Object.fromEntries(COMMAND_CAPABILITIES.map((name) => [name, commands.has(name)])) as Record<string, boolean>;
  const notes: string[] = [];

  if (!toolStatus.codegraph_explore) notes.push("CodeGraph tool integration is unavailable. Use an installed CodeGraph CLI through bash, or pause repository-wide architecture claims.");
  if (!toolStatus.lsp) notes.push("Native LSP is unavailable. Use repository-native language tooling and label exact symbol analysis as limited.");
  if (!toolStatus.checkpoint || !toolStatus.rewind) notes.push("Checkpoint/rewind is unavailable. Preserve decisions in the Markdown ledger and use normal compaction when needed.");
  if (!toolStatus.security_scan) notes.push("Native security_scan is unavailable. Use repository-native scanners plus an independent read-only security review.");
  if (!memoryConfigured) notes.push("No approved persistent-memory integration was detected. Write lessons.md locally and leave retention off.");
  if (!commandStatus.advisor) notes.push(runtime === "Pi" ? "OMP Advisor is not native to Pi. Keep the required independent C/D stages instead." : "Advisor is unavailable. Keep the required independent C/D stages.");
  if (!commandStatus.review) notes.push("Native review command is unavailable. Run the recorded C/D review contract directly.");

  return {
    runtime,
    tools: toolStatus,
    commands: commandStatus,
    memory: {
      configured: memoryConfigured,
      recall: toolStatus.recall,
      retain: toolStatus.retain,
      reflect: toolStatus.reflect,
      learn: toolStatus.learn,
    },
    notes,
  };
}
