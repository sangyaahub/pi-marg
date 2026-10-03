import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  emptyModelRouteState,
  isFallbackLevel,
  isStage,
  restoreModelRouteState,
  type ModelRouteState,
  type RuntimeName,
  type WorkBoundary,
} from "./model-routing";

const ROUTE_FILE = "pi-marg-route.json";

export function agentDirectory(runtime: RuntimeName, home = process.env.PI_MARG_AGENT_HOME || homedir()): string {
  return join(home, runtime === "OMP" ? ".omp" : ".pi", "agent");
}

export function userRoutePath(runtime: RuntimeName, home?: string): string {
  return join(home ? agentDirectory(runtime, home) : agentDirectory(runtime), ROUTE_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundary(value: unknown): value is WorkBoundary {
  return value === "Job/client" || value === "Personal";
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

export function parseUserRoute(raw: string): ModelRouteState | undefined {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data) || data.version !== 2) return undefined;
    const activeStage = isStage(data.activeStage) ? data.activeStage : undefined;
    const activeFallback = isFallbackLevel(data.activeFallback) ? data.activeFallback : undefined;
    return {
      version: 2,
      workType: typeof data.workType === "number" ? data.workType : undefined,
      boundary: isBoundary(data.boundary) ? data.boundary : undefined,
      skillMode: typeof data.skillMode === "string" ? data.skillMode : undefined,
      selections: isRecord(data.selections) ? data.selections as ModelRouteState["selections"] : {},
      fallbacks: isRecord(data.fallbacks) ? data.fallbacks as ModelRouteState["fallbacks"] : {},
      ...(activeStage ? { activeStage } : {}),
      ...(activeFallback ? { activeFallback } : {}),
      ...(stringList(data.exhaustedSelectors) ? { exhaustedSelectors: stringList(data.exhaustedSelectors) } : {}),
      ...(stringList(data.handledFailureKeys) ? { handledFailureKeys: stringList(data.handledFailureKeys) } : {}),
      ...(isRecord(data.lastFailover) ? { lastFailover: data.lastFailover as ModelRouteState["lastFailover"] } : {}),
    };
  } catch {
    return undefined;
  }
}

export function readUserRoute(path: string): ModelRouteState | undefined {
  try {
    return parseUserRoute(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function writeUserRoute(path: string, state: ModelRouteState): void {
  const payload = parseUserRoute(JSON.stringify({ ...state, version: 2 })) ?? emptyModelRouteState();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function routeHasChoices(state: ModelRouteState): boolean {
  return Boolean(
    state.workType
    || state.boundary
    || state.skillMode
    || Object.keys(state.selections).length > 0
    || Object.keys(state.fallbacks).length > 0,
  );
}

export function loadSavedRoute(entries: readonly unknown[], file: ModelRouteState | undefined): ModelRouteState {
  const branch = restoreModelRouteState(entries);
  if (routeHasChoices(branch)) return branch;
  return file ?? branch;
}

export function loadRuntimeRoute(runtime: RuntimeName, entries: readonly unknown[], home?: string): ModelRouteState {
  return loadSavedRoute(entries, readUserRoute(userRoutePath(runtime, home)));
}

export function rememberRuntimeRoute(runtime: RuntimeName, state: ModelRouteState, home?: string): void {
  writeUserRoute(userRoutePath(runtime, home), state);
}
