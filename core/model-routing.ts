export type AutoStage = "A" | "B" | "C" | "D";
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
  version: 1;
  workType?: number;
  selections: Partial<Record<AutoStage, ModelSelection>>;
}

export interface ModelRouteParams {
  action: "catalog" | "select" | "activate" | "status";
  stage?: AutoStage;
  target?: string;
  workType?: number;
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

export const MODEL_STATE_TYPE = "co.sangyaa.pi-marg.model-routing.v1";
export const STAGES: AutoStage[] = ["A", "B", "C", "D"];

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
  return { version: 1, selections: {} };
}

export function isStage(value: unknown): value is AutoStage {
  return typeof value === "string" && STAGES.includes(value as AutoStage);
}

export function requiredStagesForWorkType(workType: number): AutoStage[] {
  switch (workType) {
    case 2:
    case 3:
      return ["A", "C", "B", "D"];
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
    if (entry?.type === "custom" && entry.customType === MODEL_STATE_TYPE && entry.data?.version === 1) {
      restored = entry.data as ModelRouteState;
    }
  }
  return restored;
}

export async function executeModelRoute(
  currentState: ModelRouteState,
  params: ModelRouteParams,
  port: ModelRoutePort,
): Promise<ModelRouteExecution> {
  const catalog = buildModelCatalog(port.models, port.hasExternalDevin);

  if (params.action === "catalog") {
    const workType = Number(params.workType);
    const requiredStages = Number.isInteger(workType) ? requiredStagesForWorkType(workType) : STAGES;
    return {
      state: currentState,
      response: toolResult(
        JSON.stringify({ runtime: port.runtimeName, requiredStages, catalog, notes: catalogNotes(port.runtimeName, catalog) }, null, 2),
        { runtime: port.runtimeName, requiredStages, catalog, state: currentState },
      ),
    };
  }

  if (params.action === "status") {
    return { state: currentState, response: toolResult(JSON.stringify(currentState, null, 2), { state: currentState }) };
  }

  if (!isStage(params.stage)) {
    return { state: currentState, response: toolResult("A valid stage A, B, C, or D is required.", { state: currentState }, true) };
  }

  const stage = params.stage;
  if (params.action === "select") {
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
      version: 1,
      workType: Number.isInteger(workType) && workType >= 1 && workType <= 7 ? workType : currentState.workType,
      selections: {
        ...currentState.selections,
        [stage]: { ...selected, selectedAt: port.now?.() ?? new Date().toISOString() },
      },
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
    return { state: currentState, response: toolResult(`Stage ${stage} uses an external Devin session. Delegate only after post-web approval.`, { state: currentState, selected }) };
  }
  const model = port.models.find((item) => `${item.provider}/${item.id}` === selected.selector);
  if (!model) return { state: currentState, response: toolResult(`Saved model ${selected.selector} is unavailable. Select a replacement.`, { state: currentState }, true) };
  const activated = await port.activate(model);
  if (activated === false) return { state: currentState, response: toolResult(`Could not activate ${selected.selector}; verify provider authentication.`, { state: currentState }, true) };
  return { state: currentState, response: toolResult(`Activated ${selected.label} (${selected.selector}) for Stage ${stage}.`, { state: currentState, selected }) };
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

function catalogNotes(runtimeName: RuntimeName, catalog: Record<AutoStage, ModelCandidate[]>): string[] {
  const notes = [
    `The catalog shows every model in ${runtimeName}'s authenticated, enabled registry at call time; selectors are never guessed or pinned.`,
    "A and C rank frontier fits first. B and D rank execution fits first. Every live model remains selectable for every stage.",
    "Zero-metered describes the runtime's reported token price; it does not promise unlimited subscription usage.",
  ];
  if (!catalog.A.some((candidate) => candidate.tier === "frontier")) {
    notes.push("No preferred frontier matches are authenticated; choose another available model or connect a provider.");
  }
  if (!catalog.B.some((candidate) => candidate.tier === "execution")) {
    notes.push("No preferred execution matches are authenticated and no external Devin tool was detected; choose another available model.");
  }
  return notes;
}
