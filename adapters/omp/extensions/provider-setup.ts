import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  probeModelIds,
  validateCustomProvider,
  writeCustomProvider,
  type CustomProviderInput,
} from "../../../core/provider-config";
import {
  numberedOptionLabel,
  resolveSelectAnswer,
  type ModelLike,
} from "../../../core/model-routing";
import { agentDirectory } from "../../../core/user-route";

const SETUP_ITEMS = [
  "Sign in to a provider",
  "Add a custom OpenAI-compatible provider",
  "Cancel",
] as const;

const DISTINCT_ITEMS = [
  "Add another model",
  "Continue and stop before the paired stage",
] as const;

export type CatalogSetup =
  | { status: "ready"; models: ModelLike[] }
  | { status: "cancelled" }
  | { status: "restart" };

async function askText(ctx: any, title: string, placeholder: string, masked = false): Promise<string | undefined> {
  const value = await ctx.ui.input(title, placeholder, masked ? { masked: true } : undefined);
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    ctx.ui.notify("Selection cancelled; no model was saved.", "warning");
    return undefined;
  }
  return trimmed;
}

async function askItems<T extends string>(
  ctx: any,
  title: string,
  items: readonly T[],
): Promise<T | undefined> {
  const answer = await ctx.ui.select(
    title,
    items.map((item, index) => numberedOptionLabel(index, item)),
    { selectionMarker: "radio" },
  );
  const resolved = resolveSelectAnswer(answer, items, (item) => item);
  switch (resolved.status) {
    case "matched":
      return resolved.item;
    case "cancelled":
      ctx.ui.notify("Selection cancelled; no model was saved.", "warning");
      return undefined;
    case "conflict":
      ctx.ui.notify("That answer matches more than one option; no model was saved.", "error");
      return undefined;
    case "unrecognized":
      ctx.ui.notify(`Unrecognized selection ${JSON.stringify(resolved.received)}; no model was saved.`, "error");
      return undefined;
    default: {
      const unreachable: never = resolved;
      return unreachable;
    }
  }
}

function envAlreadySet(home: string | undefined, name: string): boolean {
  if (process.env[name]) return true;
  const envPath = join(agentDirectory("OMP", home), ".env");
  if (!existsSync(envPath)) return false;
  return new RegExp(`^${name}=`, "m").test(readFileSync(envPath, "utf8"));
}

async function chooseProbedIds(ctx: any, typed: string[], probed: string[]): Promise<string[] | undefined> {
  const items = ["Keep the model ids I typed", "Use every returned id", ...probed];
  const choice = await askItems(ctx, "Models to register", items);
  if (!choice) return undefined;
  if (choice === "Keep the model ids I typed") return typed;
  if (choice === "Use every returned id") return probed;
  return [choice];
}

export async function addCustomProvider(ctx: any, home: string | undefined): Promise<CatalogSetup> {
  const providerId = await askText(ctx, "Custom provider", "Provider id (lowercase)");
  if (!providerId) return { status: "cancelled" };
  const displayName = await askText(ctx, "Custom provider", "Display name");
  if (!displayName) return { status: "cancelled" };
  const baseUrl = await askText(ctx, "Custom provider", "Base URL");
  if (!baseUrl) return { status: "cancelled" };
  let allowLocalHttp = false;
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "http:" && url.hostname === "127.0.0.1") {
      const confirm = await askItems(ctx, "Local endpoint", ["Use this local http endpoint", "Cancel"]);
      if (confirm !== "Use this local http endpoint") return { status: "cancelled" };
      allowLocalHttp = true;
    }
  } catch {
    ctx.ui.notify("Base URL must be an https URL.", "error");
    return { status: "cancelled" };
  }
  const envVar = await askText(ctx, "Custom provider", "Env var name");
  if (!envVar) return { status: "cancelled" };
  const modelText = await askText(ctx, "Custom provider", "Model ids, comma-separated");
  if (!modelText) return { status: "cancelled" };
  let modelIds = modelText.split(",").map((id) => id.trim()).filter(Boolean);
  const secret = envAlreadySet(home, envVar) ? undefined : await askText(ctx, "Custom provider", `${envVar} value`, true);
  if (!envAlreadySet(home, envVar) && !secret) return { status: "cancelled" };

  const draft: CustomProviderInput = {
    providerId,
    displayName,
    baseUrl,
    envVar,
    modelIds,
    allowLocalHttp,
  };
  const problem = validateCustomProvider(draft);
  if (problem) {
    ctx.ui.notify(problem, "error");
    return { status: "cancelled" };
  }

  const probeKey = secret ?? process.env[envVar];
  if (probeKey) {
    const probed = await probeModelIds(baseUrl, probeKey);
    if (probed) {
      const chosen = await chooseProbedIds(ctx, modelIds, probed);
      if (!chosen) return { status: "cancelled" };
      modelIds = chosen;
      draft.modelIds = chosen;
    }
  }

  try {
    const directory = agentDirectory("OMP", home);
    writeCustomProvider({
      modelsPath: join(directory, "models.yml"),
      envPath: join(directory, ".env"),
    }, draft, secret);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : "Could not write the provider.", "error");
    return { status: "cancelled" };
  }

  if (typeof ctx.models?.reload === "function") {
    await ctx.models.reload();
  }
  const models = (ctx.models.list() ?? []) as ModelLike[];
  if (models.length === 0) return { status: "restart" };
  return { status: "ready", models };
}

export async function configureEmptyCatalog(ctx: any, home: string | undefined): Promise<CatalogSetup> {
  const choice = await askItems(ctx, "Model setup", SETUP_ITEMS);
  if (!choice || choice === "Cancel") return { status: "cancelled" };
  if (choice === "Sign in to a provider") {
    if (typeof ctx.openLogin === "function") await ctx.openLogin();
    else ctx.ui.notify("Sign in with /login, verify with `omp models`, then run /pi-marg again.", "warning");
    const models = (ctx.models.list() ?? []) as ModelLike[];
    return models.length > 0 ? { status: "ready", models } : { status: "cancelled" };
  }
  return addCustomProvider(ctx, home);
}

export async function resolveSingleModel(ctx: any, home: string | undefined): Promise<CatalogSetup | "defer"> {
  const choice = await askItems(ctx, "Distinct models", DISTINCT_ITEMS);
  if (!choice) return { status: "cancelled" };
  if (choice === "Continue and stop before the paired stage") return "defer";
  return addCustomProvider(ctx, home);
}
