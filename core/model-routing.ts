export type AutoStage = "A" | "B" | "C" | "D";
export type FallbackLevel = "high" | "low";
export type CandidateTier = "frontier" | "execution" | "general";
export type RuntimeName = "OMP" | "Pi";

export interface ModelLike {
  provider: string;
  id: string;
  name?: string;
  cost?: Record<string, unknown>;
}

export interface ModelCandidate {
  selector: string;
  identity: string;
  label: string;
  provider: string;
  tier: CandidateTier;
  choice:
    | "claude-frontier"
    | "openai-frontier"
    | "grok-frontier"
    | "claude-mid"
    | "openai-mid"
    | "cursor-composer"
    | "included-cursor"
    | "devin-swe"
    | "included-devin"
    | "runtime-available"
    | "devin-external";
  access: "runtime-model" | "external-agent";
  billingNote?: string;
}

export interface ModelSelection extends ModelCandidate {
  selectedAt: string;
}

export interface ModelRouteState {
  version: 2;
  workType?: number;
  selections: Partial<Record<AutoStage, ModelSelection>>;
  fallbacks: Partial<Record<FallbackLevel, ModelSelection>>;
  activeStage?: AutoStage;
  activeFallback?: FallbackLevel;
  exhaustedSelectors?: string[];
  handledFailureKeys?: string[];
  lastFailover?: {
    stage?: AutoStage;
    failedSelector: string;
    fallbackLevel: FallbackLevel;
    activatedSelector: string;
    switchedAt: string;
  };
}

export interface ModelRouteParams {
  action: "catalog" | "select" | "select_fallback" | "activate" | "status";
  stage?: AutoStage;
  fallback?: FallbackLevel;
  target?: string;
  workType?: number;
  provider?: string;
}

export interface ModelRoutePort {
  runtimeName: RuntimeName;
  models: ModelLike[];
  hasExternalDevin: boolean;
  activate(model: ModelLike): Promise<boolean | void>;
  persist(state: ModelRouteState): void;
  now?(): string;
}

export interface ModelRouteExecution {
  state: ModelRouteState;
  response: ReturnType<typeof toolResult>;
}

export interface AutomaticFailoverExecution {
  state: ModelRouteState;
  switched?: {
    level: FallbackLevel;
    selection: ModelSelection;
  };
  exhausted: boolean;
  stateChanged: boolean;
  reusedCurrent?: boolean;
  ignoredDuplicate?: boolean;
  persistenceError?: string;
}

export interface TerminalUsageFailure {
  role: "assistant";
  stopReason: "error";
  errorMessage: string;
  provider?: string;
  model?: string;
  responseId?: string;
  timestamp?: number;
}

export interface ToolUsageFailure {
  selector: string;
  key: string;
}

export const MODEL_STATE_TYPE = "co.sangyaa.pi-marg.model-routing.v1";
export const STAGES: AutoStage[] = ["A", "B", "C", "D"];
export const FALLBACK_LEVELS: FallbackLevel[] = ["high", "low"];

const USAGE_LIMIT_PATTERNS = [
  /usage[\s_-]*limit/i,
  /quota[^\n]{0,40}(?:exceeded|exhausted|reached|depleted|limit)/i,
  /insufficient[_ -]?quota/i,
  /monthly\s+usage\s+limit/i,
  /weekly\s+(?:usage\s+)?limit/i,
  /available\s+balance[^\n]{0,40}(?:\b0\b|depleted|exhausted|insufficient)/i,
  /out\s+of\s+(?:budget|credits?)/i,
  /credits?\s+(?:are\s+)?exhausted/i,
  /agent\s+compute\s+units?[^\n]{0,40}(?:exhausted|depleted|limit|remaining\s*:?\s*0)/i,
  /\bACUs?\b[^\n]*(?:exhausted|limit|remaining\s*:?\s*0)/i,
];

const ERROR_TEXT_KEYS = ["error", "errorMessage", "message", "stderr", "output", "content"];
const ERROR_CONTAINER_KEYS = ["details", "result"];
const MAX_ERROR_TEXT_LENGTH = 32_000;
const MAX_ERROR_NODES = 200;
const MAX_HANDLED_FAILURE_KEYS = 32;
const EXACT_MODEL_EXECUTION_TOOLS = new Set([
  "task",
  "subagent",
  "spawn_agent",
  "run_agent",
  "agent",
  "workflowz",
  "orchestrate",
  "advisor",
]);

const FRONTIER_PATTERNS: Array<[ModelCandidate["choice"], RegExp]> = [
  ["claude-frontier", /(?:claude[^\n]*(?:fable|opus)|(?:fable|opus)[^\n]*claude)/i],
  ["openai-frontier", /(?:gpt[^\n]*(?:astra|\bsol\b)|(?:astra|\bsol\b)[^\n]*gpt)/i],
  ["grok-frontier", /grok[^\n]*4[._ -](?:[6-9]|\d{2,})(?:\b|[-_])/i],
];

const EXECUTION_PATTERNS: Array<[ModelCandidate["choice"], RegExp]> = [
  ["claude-mid", /claude[^\n]*sonnet/i],
  ["openai-mid", /(?:gpt|codex)[^\n]*(?:terra|luna|mini|codex)/i],
  ["cursor-composer", /composer/i],
];

export function emptyModelRouteState(): ModelRouteState {
  return { version: 2, selections: {}, fallbacks: {} };
}

export function isFallbackLevel(value: unknown): value is FallbackLevel {
  return typeof value === "string" && FALLBACK_LEVELS.includes(value as FallbackLevel);
}

export function isUsageLimitErrorText(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return USAGE_LIMIT_PATTERNS.some((pattern) => pattern.test(value));
}

export function hasConfiguredFallback(state: ModelRouteState): boolean {
  const high = state.fallbacks.high;
  const low = state.fallbacks.low;
  return Boolean(
    high
    && low
    && high.access === "runtime-model"
    && low.access === "runtime-model"
    && high.identity !== low.identity,
  );
}

export function findTerminalUsageLimitFailure(messages: readonly unknown[]): TerminalUsageFailure | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = asRecord(messages[index]);
    if (message?.role !== "assistant") continue;
    if (message.stopReason !== "error" || typeof message.errorMessage !== "string") return undefined;
    if (!isUsageLimitErrorText(message.errorMessage)) return undefined;
    return {
      role: "assistant",
      stopReason: "error",
      errorMessage: message.errorMessage,
      ...(typeof message.provider === "string" ? { provider: message.provider } : {}),
      ...(typeof message.model === "string" ? { model: message.model } : {}),
      ...(typeof message.responseId === "string" ? { responseId: message.responseId } : {}),
      ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
    };
  }
  return undefined;
}

export function failedModelSelector(message: TerminalUsageFailure, current?: ModelLike): string {
  if (message.provider && message.model) {
    return `${message.provider}/${message.model}`;
  }
  return current?.provider && current?.id ? `${current.provider}/${current.id}` : "unknown-model";
}

export function modelFailureKey(message: TerminalUsageFailure): string {
  if (message.responseId) return `model:${message.responseId}`;
  return `model:${message.provider ?? "unknown"}/${message.model ?? "unknown"}:${message.timestamp ?? "no-time"}:${message.errorMessage}`;
}

export function modelToolUsageLimitFailure(event: unknown): ToolUsageFailure | undefined {
  const record = asRecord(event);
  const toolName = typeof record?.toolName === "string" ? record.toolName : "";
  if (record?.isError !== true || !isModelExecutionTool(toolName)) return undefined;
  if (!isUsageLimitErrorText(boundedErrorText(record.result))) return undefined;
  return {
    selector: isDevinExecutionTool(toolName) ? "devin/external-session" : `tool/${toolName}`,
    key: `tool:${typeof record.toolCallId === "string" ? record.toolCallId : `${toolName}:${boundedErrorText(record.result)}`}`,
  };
}

export function formatFailoverRecoveryMessage(
  state: ModelRouteState,
  failedSelector: string,
  level: FallbackLevel,
  target: string,
  reusedCurrent = false,
): string {
  const stage = state.activeStage ? `Stage ${state.activeStage}` : "the active PiMarg stage";
  return [
    `[PiMarg auto-failover] ${failedSelector} reached its usage limit.`,
    reusedCurrent
      ? `Kept the active ${level} backup: ${target}.`
      : `Switched to the ${level} backup: ${target}.`,
    `Resume the current ${stage} work from the last safe point. Inspect existing files, tool results, and external state before repeating any side effect. Do not restart intake or the approved plan.`,
  ].join("\n");
}

export function isStage(value: unknown): value is AutoStage {
  return typeof value === "string" && STAGES.includes(value as AutoStage);
}

export function requiredStagesForWorkType(workType: number): AutoStage[] {
  switch (workType) {
    case 2:
    case 3:
      return ["A", "B", "C", "D"];
    case 4:
      return ["A", "B", "D"];
    case 1:
    case 5:
    case 6:
    case 7:
      return ["A", "C"];
    default:
      return [];
  }
}

export function ascendingStages(stages: readonly AutoStage[]): AutoStage[] {
  return STAGES.filter((stage) => stages.includes(stage));
}

export function emptyCatalogSetupMessage(runtimeName: RuntimeName): string {
  if (runtimeName === "OMP") {
    return [
      "No authenticated and enabled OMP models were found.",
      "Set up any provider subscription with /login, verify with `omp models` or /model, then run /pi-marg again.",
      "PiMarg picks up whatever models you configure in OMP; see MODEL-SETUP.md.",
    ].join(" ");
  }
  return [
    "No authenticated and available Pi models were found.",
    "Configure any provider subscription or API credentials, verify with `pi --list-models`, then retry.",
    "PiMarg picks up whatever models you configure in Pi; see MODEL-SETUP.md.",
  ].join(" ");
}

export function normalizeModelIdentity(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/^[^/]+\//, "")
    .replace(/(?:-latest|:latest)$/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");

  normalized = normalized
    .replace(/^cursor-/, "")
    .replace(/-\d{4}-(?:non-)?reasoning$/, "")
    .replace(/-multi-agent-\d{4}$/, "")
    .replace(/-\d{8}$/, "")
    .replace(/(\d)-(?=\d)/g, "$1.")
    .replace(/^claude-(\d+(?:\.\d+)?)-(opus|sonnet)/, "claude-$2-$1")
    .replace(/-1m$/, "");

  let previous: string;
  do {
    previous = normalized;
    normalized = normalized.replace(
      /-(?:thinking-)?(?:minimal|low|medium|high|xhigh|max|fast|lightning)$/,
      "",
    );
  } while (normalized !== previous);

  return normalized;
}

export function classifyModel(model: ModelLike): ModelCandidate {
  const selector = `${model.provider}/${model.id}`;
  const haystack = `${model.provider} ${model.id} ${model.name ?? ""}`;

  for (const [choice, pattern] of FRONTIER_PATTERNS) {
    if (pattern.test(haystack)) return candidate(model, selector, choice, "frontier");
  }
  for (const [choice, pattern] of EXECUTION_PATTERNS) {
    if (pattern.test(haystack)) return candidate(model, selector, choice, "execution");
  }

  if (/^devin$/i.test(model.provider) && /^swe[-_. ]/i.test(model.id)) {
    return candidate(model, selector, "devin-swe", "execution");
  }
  if (/cursor/i.test(model.provider) && isZeroMetered(model.cost)) {
    return {
      ...candidate(model, selector, "included-cursor", "execution"),
      billingNote: "The runtime reports zero metered token cost; plan quotas or pool limits may still apply.",
    };
  }
  if (/^devin$/i.test(model.provider) && isZeroMetered(model.cost)) {
    return {
      ...candidate(model, selector, "included-devin", "execution"),
      billingNote: "The runtime reports zero metered token cost; Devin plan quotas or pool limits may still apply.",
    };
  }
  return candidate(model, selector, "runtime-available", "general");
}

export function buildModelCatalog(models: ModelLike[], hasExternalDevin: boolean) {
  const candidates = [...new Map(models.map((model) => {
    const item = classifyModel(model);
    return [item.selector, item] as const;
  })).values()];

  const frontier = [...candidates].sort((left, right) => compareForStage(left, right, "frontier"));
  const execution = [...candidates].sort((left, right) => compareForStage(left, right, "execution"));

  if (hasExternalDevin) {
    execution.push({
      selector: "devin/external-session",
      identity: "devin-external-session",
      label: "Devin external session",
      provider: "devin",
      tier: "execution",
      choice: "devin-external",
      access: "external-agent",
      billingNote: "Uses Devin quota rather than a runtime model slot; session creation requires post-web approval.",
    });
    execution.sort((left, right) => compareForStage(left, right, "execution"));
  }

  return {
    A: frontier,
    B: execution,
    C: frontier,
    D: execution,
  } satisfies Record<AutoStage, ModelCandidate[]>;
}

export function buildFallbackCatalog(catalog: Record<AutoStage, ModelCandidate[]>) {
  return {
    high: catalog.A.filter((candidate) => candidate.access === "runtime-model"),
    low: catalog.B.filter((candidate) => candidate.access === "runtime-model"),
  } satisfies Record<FallbackLevel, ModelCandidate[]>;
}

export function numberedOptionLabel(index: number, text: string): string {
  return `${index + 1}. ${text}`;
}

export function matchNumberedOption<T>(
  answer: string | undefined,
  items: readonly T[],
  labelOf: (item: T) => string,
): T | undefined {
  if (!answer) return undefined;
  return items.find((item, index) => numberedOptionLabel(index, labelOf(item)) === answer);
}

export function uniqueProviders(candidates: readonly ModelCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.provider))].sort((left, right) => left.localeCompare(right));
}

export function candidatesForProvider(
  candidates: readonly ModelCandidate[],
  provider: string,
): ModelCandidate[] {
  return candidates.filter((candidate) => candidate.provider === provider);
}

export function formatCatalogPresentation(
  runtimeName: RuntimeName,
  catalog: Record<AutoStage, ModelCandidate[]>,
  requiredStages: AutoStage[],
  providerFilter?: string,
) {
  const notes = catalogNotes(runtimeName, catalog);
  const orderedStages = ascendingStages(requiredStages);
  const stages: Record<string, {
    providers: Array<{ index: number; name: string; count: number }>;
    providerFilter: string | null;
    count: number;
    options: Array<{
      index: number;
      selector: string;
      label: string;
      provider: string;
      tier: CandidateTier;
      choice: ModelCandidate["choice"];
    }>;
  }> = {};
  const lines: string[] = [
    `${runtimeName} model catalog`,
    `Required stages: ${orderedStages.join(", ")}`,
    "",
  ];

  for (const stage of orderedStages) {
    const all = catalog[stage];
    const providers = uniqueProviders(all).map((name, index) => ({
      index: index + 1,
      name,
      count: candidatesForProvider(all, name).length,
    }));
    const shown = providerFilter ? candidatesForProvider(all, providerFilter) : [];
    const options = shown.map((candidate, index) => ({
      index: index + 1,
      selector: candidate.selector,
      label: candidate.label,
      provider: candidate.provider,
      tier: candidate.tier,
      choice: candidate.choice,
    }));
    stages[stage] = {
      providers,
      providerFilter: providerFilter ?? null,
      count: providerFilter ? shown.length : all.length,
      options,
    };

    lines.push(`## Stage ${stage} (${all.length} models across ${providers.length} providers)`);
    lines.push("Providers:");
    for (const provider of providers) {
      const marker = providerFilter === provider.name ? " ← selected" : "";
      lines.push(`  ${provider.index}. ${provider.name} (${provider.count})${marker}`);
    }
    if (!providerFilter) {
      lines.push("Call catalog again with provider=<name> to list every model for that provider.");
    } else {
      lines.push(`Models for ${providerFilter} (${shown.length}):`);
      for (const option of options) {
        lines.push(`  ${option.index}. ${option.label} — ${option.selector} [${option.tier}]`);
      }
    }
    lines.push("");
  }

  for (const note of notes) lines.push(`- ${note}`);
  lines.push("- Present every provider as 1,2,… then every model for the chosen provider as 1,2,… Never omit a logged-in provider.");
  lines.push("- Select with action=select using the exact selector string.");
  lines.push("- Also save two distinct runtime-only backups with action=select_fallback: high first, then low.");

  return {
    text: lines.join("\n"),
    presentation: { runtime: runtimeName, requiredStages: orderedStages, stages, notes },
  };
}

export function validateDistinctSelection(
  state: ModelRouteState,
  stage: AutoStage,
  candidate: ModelCandidate,
): string | undefined {
  const opposite: Record<AutoStage, AutoStage> = { A: "C", C: "A", B: "D", D: "B" };
  const otherStage = opposite[stage];
  const other = state.selections[otherStage];
  if (other && other.identity === candidate.identity) {
    return `Stage ${stage} cannot use ${candidate.label}; Stage ${otherStage} already uses the same model. Choose a different model.`;
  }
  return undefined;
}

export function restoreModelRouteState(entries: readonly any[]): ModelRouteState {
  let restored = emptyModelRouteState();
  for (const entry of entries) {
    if (entry?.type !== "custom" || entry.customType !== MODEL_STATE_TYPE) continue;
    if (entry.data?.version === 2) {
      restored = {
        ...entry.data,
        version: 2,
        selections: entry.data.selections ?? {},
        fallbacks: entry.data.fallbacks ?? {},
      } as ModelRouteState;
      continue;
    }
    if (entry.data?.version === 1) {
      restored = {
        version: 2,
        workType: entry.data.workType,
        selections: entry.data.selections ?? {},
        fallbacks: {},
      };
    }
  }
  return restored;
}

export async function executeAutomaticFailover(
  currentState: ModelRouteState,
  failedSelector: string,
  port: ModelRoutePort,
  failureKey?: string,
): Promise<AutomaticFailoverExecution> {
  const failed = failedSelector.trim() || "unknown-model";
  const handledFailureKeys = currentState.handledFailureKeys ?? [];
  if (failureKey && handledFailureKeys.includes(failureKey)) {
    return {
      state: currentState,
      exhausted: false,
      stateChanged: false,
      ignoredDuplicate: true,
    };
  }
  const nextHandledFailureKeys = failureKey
    ? [...handledFailureKeys, failureKey].slice(-MAX_HANDLED_FAILURE_KEYS)
    : handledFailureKeys;
  const exhausted = new Set(currentState.exhaustedSelectors ?? []);
  exhausted.add(failed);
  const activeLevel = currentState.activeFallback;
  const activeSelection = activeLevel ? currentState.fallbacks[activeLevel] : undefined;

  if (activeLevel && activeSelection && activeSelection.selector !== failed) {
    const nextState: ModelRouteState = {
      ...currentState,
      handledFailureKeys: nextHandledFailureKeys,
      exhaustedSelectors: [...exhausted],
    };
    const persistenceError = persistFailoverState(port, nextState);
    return {
      state: nextState,
      switched: { level: activeLevel, selection: activeSelection },
      exhausted: false,
      stateChanged: true,
      reusedCurrent: true,
      ...(persistenceError ? { persistenceError } : {}),
    };
  }

  const startingIndex = activeLevel ? FALLBACK_LEVELS.indexOf(activeLevel) + 1 : 0;

  for (const level of FALLBACK_LEVELS.slice(startingIndex)) {
    const selection = currentState.fallbacks[level];
    if (!selection || selection.access !== "runtime-model" || exhausted.has(selection.selector)) continue;
    const model = port.models.find((item) => `${item.provider}/${item.id}` === selection.selector);
    if (!model) {
      exhausted.add(selection.selector);
      continue;
    }
    let activated: boolean | void;
    try {
      activated = await port.activate(model);
    } catch {
      exhausted.add(selection.selector);
      continue;
    }
    if (activated === false) {
      exhausted.add(selection.selector);
      continue;
    }

    const nextState: ModelRouteState = {
      ...currentState,
      version: 2,
      activeFallback: level,
      exhaustedSelectors: [...exhausted],
      handledFailureKeys: nextHandledFailureKeys,
      lastFailover: {
        stage: currentState.activeStage,
        failedSelector: failed,
        fallbackLevel: level,
        activatedSelector: selection.selector,
        switchedAt: port.now?.() ?? new Date().toISOString(),
      },
    };
    const persistenceError = persistFailoverState(port, nextState);
    return {
      state: nextState,
      switched: { level, selection },
      exhausted: false,
      stateChanged: true,
      ...(persistenceError ? { persistenceError } : {}),
    };
  }

  const exhaustedSelectors = [...exhausted];
  const priorExhausted = new Set(currentState.exhaustedSelectors ?? []);
  const stateChanged = exhaustedSelectors.length !== priorExhausted.size
    || exhaustedSelectors.some((selector) => !priorExhausted.has(selector))
    || nextHandledFailureKeys.length !== handledFailureKeys.length;
  if (!stateChanged) {
    return { state: currentState, exhausted: true, stateChanged: false };
  }
  const nextState: ModelRouteState = {
    ...currentState,
    version: 2,
    exhaustedSelectors,
    handledFailureKeys: nextHandledFailureKeys,
  };
  const persistenceError = persistFailoverState(port, nextState);
  return {
    state: nextState,
    exhausted: true,
    stateChanged: true,
    ...(persistenceError ? { persistenceError } : {}),
  };
}

export async function executeModelRoute(
  currentState: ModelRouteState,
  params: ModelRouteParams,
  port: ModelRoutePort,
): Promise<ModelRouteExecution> {
  if (params.action === "catalog") {
    const catalog = buildModelCatalog(port.models, port.hasExternalDevin);
    const fallbackCatalog = buildFallbackCatalog(catalog);
    if (port.models.length === 0) {
      return {
        state: currentState,
        response: toolResult(
          emptyCatalogSetupMessage(port.runtimeName),
          { runtime: port.runtimeName, catalog, fallbackCatalog, state: currentState },
          true,
        ),
      };
    }
    const workType = Number(params.workType);
    const requiredStages = Number.isInteger(workType) ? requiredStagesForWorkType(workType) : STAGES;
    const providerFilter = typeof params.provider === "string" && params.provider.trim() ? params.provider.trim() : undefined;
    if (providerFilter) {
      const known = STAGES.some((stage) => catalog[stage].some((candidate) => candidate.provider === providerFilter));
      if (!known) {
        return {
          state: currentState,
          response: toolResult(
            `Provider ${providerFilter} is not in the live authenticated catalog. Refresh catalog without a provider filter.`,
            { runtime: port.runtimeName, requiredStages, catalog, state: currentState },
            true,
          ),
        };
      }
    }
    const formatted = formatCatalogPresentation(port.runtimeName, catalog, requiredStages, providerFilter);
    return {
      state: currentState,
      response: toolResult(formatted.text, {
        runtime: port.runtimeName,
        requiredStages: formatted.presentation.requiredStages,
        catalog,
        fallbackCatalog,
        presentation: formatted.presentation,
        state: currentState,
      }),
    };
  }

  if (params.action === "status") {
    return { state: currentState, response: toolResult(JSON.stringify(currentState, null, 2), { state: currentState }) };
  }

  if (params.action === "select_fallback") {
    const catalog = buildModelCatalog(port.models, port.hasExternalDevin);
    const fallbackCatalog = buildFallbackCatalog(catalog);
    if (!isFallbackLevel(params.fallback)) {
      return { state: currentState, response: toolResult("A fallback level of high or low is required.", { state: currentState }, true) };
    }
    if (typeof params.target !== "string") {
      return { state: currentState, response: toolResult("Select an exact runtime selector from the current catalog.", { fallbackCatalog, state: currentState }, true) };
    }
    const level = params.fallback;
    if (level === "low" && !currentState.fallbacks.high) {
      return {
        state: currentState,
        response: toolResult("Select the high fallback before the low fallback so the recovery order is explicit.", { fallbackCatalog, state: currentState }, true),
      };
    }
    const selected = fallbackCatalog[level].find((item) => item.selector === params.target);
    if (!selected) {
      return { state: currentState, response: toolResult(`Target ${params.target} is not an available ${level} fallback choice. Refresh the catalog.`, { fallbackCatalog, state: currentState }, true) };
    }
    const otherLevel: FallbackLevel = level === "high" ? "low" : "high";
    const other = currentState.fallbacks[otherLevel];
    if (other?.identity === selected.identity) {
      return { state: currentState, response: toolResult(`The ${level} fallback must use a different model from the ${otherLevel} fallback.`, { fallbackCatalog, state: currentState }, true) };
    }
    const nextState: ModelRouteState = {
      ...currentState,
      version: 2,
      fallbacks: {
        ...currentState.fallbacks,
        [level]: { ...selected, selectedAt: port.now?.() ?? new Date().toISOString() },
      },
      activeFallback: undefined,
      exhaustedSelectors: [],
      handledFailureKeys: [],
    };
    port.persist(nextState);
    return {
      state: nextState,
      response: toolResult(
        `Saved ${selected.label} (${selected.selector}) as the ${level} fallback. It will activate only after a usage-limit failure.`,
        { state: nextState, selected, fallback: level },
      ),
    };
  }

  if (!isStage(params.stage)) {
    return { state: currentState, response: toolResult("A valid stage A, B, C, or D is required.", { state: currentState }, true) };
  }

  const stage = params.stage;
  if (params.action === "select") {
    const catalog = buildModelCatalog(port.models, port.hasExternalDevin);
    if (typeof params.target !== "string") {
      return { state: currentState, response: toolResult("Select an exact selector from the current catalog.", { catalog, state: currentState }, true) };
    }
    const selected = catalog[stage].find((item) => item.selector === params.target);
    if (!selected) {
      return { state: currentState, response: toolResult(`Target ${params.target} is not an available Stage ${stage} choice. Refresh the catalog.`, { catalog, state: currentState }, true) };
    }
    const conflict = validateDistinctSelection(currentState, stage, selected);
    if (conflict) return { state: currentState, response: toolResult(conflict, { catalog, state: currentState }, true) };

    if (selected.access === "runtime-model") {
      const model = port.models.find((item) => `${item.provider}/${item.id}` === selected.selector);
      if (!model) return { state: currentState, response: toolResult("The selected model disappeared; refresh the catalog.", { state: currentState }, true) };
      const activated = await port.activate(model);
      if (activated === false) return { state: currentState, response: toolResult(`Could not activate ${selected.selector}; verify provider authentication.`, { state: currentState }, true) };
    }

    const workType = Number(params.workType);
    const nextState: ModelRouteState = {
      ...currentState,
      version: 2,
      workType: Number.isInteger(workType) && workType >= 1 && workType <= 7 ? workType : currentState.workType,
      selections: {
        ...currentState.selections,
        [stage]: { ...selected, selectedAt: port.now?.() ?? new Date().toISOString() },
      },
      activeStage: stage,
      activeFallback: undefined,
      exhaustedSelectors: [],
      handledFailureKeys: [],
    };
    port.persist(nextState);
    return {
      state: nextState,
      response: toolResult(
        selected.access === "external-agent"
          ? `Selected ${selected.label} for Stage ${stage}. Obtain post-web approval before creating its session.`
          : `Selected and activated ${selected.label} (${selected.selector}) for Stage ${stage}.`,
        { state: nextState, selected },
      ),
    };
  }

  const selected = currentState.selections[stage];
  if (!selected) {
    return { state: currentState, response: toolResult(`No model is selected for Stage ${stage}. Run catalog, then select first.`, { state: currentState }, true) };
  }
  if (selected.access === "external-agent") {
    if (!port.hasExternalDevin) return { state: currentState, response: toolResult("Devin was selected but no external Devin tool is available.", { state: currentState }, true) };
    const nextState: ModelRouteState = {
      ...currentState,
      activeStage: stage,
      activeFallback: undefined,
      exhaustedSelectors: [],
      handledFailureKeys: [],
    };
    port.persist(nextState);
    return { state: nextState, response: toolResult(`Stage ${stage} uses an external Devin session. Delegate only after post-web approval.`, { state: nextState, selected }) };
  }
  const model = port.models.find((item) => `${item.provider}/${item.id}` === selected.selector);
  if (!model) return { state: currentState, response: toolResult(`Saved model ${selected.selector} is unavailable. Select a replacement.`, { state: currentState }, true) };
  const activated = await port.activate(model);
  if (activated === false) return { state: currentState, response: toolResult(`Could not activate ${selected.selector}; verify provider authentication.`, { state: currentState }, true) };
  const nextState: ModelRouteState = {
    ...currentState,
    activeStage: stage,
    activeFallback: undefined,
    exhaustedSelectors: [],
    handledFailureKeys: [],
  };
  port.persist(nextState);
  return { state: nextState, response: toolResult(`Activated ${selected.label} (${selected.selector}) for Stage ${stage}.`, { state: nextState, selected }) };
}

function boundedErrorText(value: unknown): string {
  const parts: string[] = [];
  const seen = new Set<object>();
  let remaining = MAX_ERROR_TEXT_LENGTH;
  let nodes = 0;

  const append = (text: string) => {
    if (remaining <= 0 || text.length === 0) return;
    const fragment = text.slice(0, remaining);
    parts.push(fragment);
    remaining -= fragment.length;
  };

  const visit = (item: unknown, includePlainText = true) => {
    if (remaining <= 0 || nodes >= MAX_ERROR_NODES || item == null) return;
    nodes += 1;
    if (typeof item === "string") {
      if (includePlainText) append(item);
      return;
    }
    if (typeof item !== "object") {
      if (includePlainText) append(String(item));
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);

    if (item instanceof Error) {
      append(item.message);
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child, includePlainText);
      return;
    }

    const record = item as Record<string, unknown>;
    if (includePlainText && record.type === "text" && typeof record.text === "string") append(record.text);
    for (const key of ERROR_TEXT_KEYS) {
      if (!(key in record)) continue;
      try {
        visit(record[key], true);
      } catch {
        // Ignore getters that throw while inspecting an external tool error.
      }
    }
    for (const key of ERROR_CONTAINER_KEYS) {
      if (!(key in record)) continue;
      try {
        visit(record[key], false);
      } catch {
        // Ignore getters that throw while inspecting an external tool error.
      }
    }
  };

  visit(value);
  return parts.join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function isDevinExecutionTool(toolName: string): boolean {
  return /^(?:mcp__)?devin(?:__|_|$)/i.test(toolName);
}

function isModelExecutionTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return EXACT_MODEL_EXECUTION_TOOLS.has(normalized)
    || /^(?:spawn_agent|run_agent|subagent)(?:__|_|$)/.test(normalized)
    || /^(?:mcp__)?(?:devin|workflowz)(?:__|_|$)/.test(normalized);
}

function persistFailoverState(port: ModelRoutePort, state: ModelRouteState): string | undefined {
  try {
    port.persist(state);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function candidate(
  model: ModelLike,
  selector: string,
  choice: ModelCandidate["choice"],
  tier: CandidateTier,
): ModelCandidate {
  return {
    selector,
    identity: normalizeModelIdentity(model.id),
    label: model.name?.trim() || model.id,
    provider: model.provider,
    tier,
    choice,
    access: "runtime-model",
  };
}

function isZeroMetered(cost: Record<string, unknown> | undefined): boolean {
  if (!cost) return false;
  const values = Object.values(cost).filter((value): value is number => typeof value === "number");
  return values.length > 0 && values.every((value) => value === 0);
}

function versionParts(candidate: ModelCandidate): number[] {
  return `${candidate.label} ${candidate.selector}`.match(/\d+(?:\.\d+)*/g)?.flatMap((part) => part.split(".").map(Number)) ?? [];
}

function compareCandidates(left: ModelCandidate, right: ModelCandidate): number {
  if (left.choice !== right.choice) return left.choice.localeCompare(right.choice);
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.selector.localeCompare(right.selector);
}

function compareForStage(
  left: ModelCandidate,
  right: ModelCandidate,
  preferredTier: Exclude<CandidateTier, "general">,
): number {
  const leftRank = left.tier === preferredTier ? 0 : left.tier === "general" ? 1 : 2;
  const rightRank = right.tier === preferredTier ? 0 : right.tier === "general" ? 1 : 2;
  return leftRank - rightRank || compareCandidates(left, right);
}

function toolResult(text: string, details: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true } : {}),
  };
}

function catalogHasProvider(catalog: Record<AutoStage, ModelCandidate[]>, provider: string): boolean {
  return STAGES.some((stage) => catalog[stage].some((candidate) => candidate.provider === provider));
}

function catalogNotes(runtimeName: RuntimeName, catalog: Record<AutoStage, ModelCandidate[]>): string[] {
  const notes = [
    `The catalog shows every model in ${runtimeName}'s authenticated, enabled registry at call time; selectors are never guessed, pinned, or limited to a maintainer's subscriptions.`,
    "A and C rank recognizable frontier fits first when present. B and D rank recognizable execution fits first when present. Every live model remains selectable for every stage.",
    "Zero-metered describes the runtime's reported token price; it does not promise unlimited subscription usage.",
  ];
  if (!catalog.A.some((candidate) => candidate.tier === "frontier")) {
    notes.push("No preferred frontier matches are authenticated; choose another available model or connect a provider.");
  }
  if (!catalog.B.some((candidate) => candidate.tier === "execution")) {
    notes.push("No preferred execution matches are authenticated and no external Devin tool was detected; choose another available model.");
  }
  if (
    runtimeName === "OMP"
    && catalogHasProvider(catalog, "cursor")
    && catalogHasProvider(catalog, "openai-codex")
  ) {
    notes.push(
      "OMP compatibility warning (@oh-my-pi/pi-coding-agent 18.1.17): mid-session switches from cursor to openai-codex can reject tool call_id values longer than 64 characters when prior cursor-agent history is replayed. Start a fresh session that does not replay the affected tool history; branching alone is insufficient if that history is retained. This is a harness limitation, not a PiMarg model-routing failure.",
    );
  }
  return notes;
}
