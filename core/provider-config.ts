import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface CustomProviderInput {
  providerId: string;
  displayName: string;
  baseUrl: string;
  envVar: string;
  modelIds: string[];
  allowLocalHttp: boolean;
}

export interface ProviderFiles {
  modelsPath: string;
  envPath: string;
}

const PROVIDER_ID = /^[a-z0-9_-]+$/;
const ENV_VAR = /^[A-Z][A-Z0-9_]*$/;
const MODEL_ID = /^[A-Za-z0-9._:-]+$/;

export function validateCustomProvider(input: CustomProviderInput): string | undefined {
  if (!PROVIDER_ID.test(input.providerId)) {
    return "Provider id must be lowercase letters, numbers, underscores, or hyphens.";
  }
  if (!input.displayName.trim()) return "Display name is required.";
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    return "Base URL must be an https URL.";
  }
  const local = url.protocol === "http:" && url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && input.allowLocalHttp)) {
    return "Base URL must use https unless you confirm a local http://127.0.0.1 endpoint.";
  }
  if (!ENV_VAR.test(input.envVar)) {
    return "Env var name must match the runtime convention, such as EXAMPLE_GATEWAY_API_KEY.";
  }
  if (input.modelIds.length === 0) return "At least one model id is required.";
  const unique = new Set(input.modelIds);
  if (unique.size !== input.modelIds.length) return "Model ids must be unique.";
  if (input.modelIds.some((id) => !MODEL_ID.test(id))) return "Model ids must be non-empty and contain no spaces.";
  return undefined;
}

function yamlString(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function renderProviderBlock(input: CustomProviderInput): string {
  const models = input.modelIds.map((id, index) => {
    const name = index === 0 && input.displayName.trim() ? input.displayName.trim() : id;
    return `      - id: ${yamlString(id)}\n        name: ${yamlString(name)}`;
  }).join("\n");
  return [
    `  ${input.providerId}:`,
    `    baseUrl: ${yamlString(input.baseUrl)}`,
    "    api: openai-completions",
    `    apiKey: ${input.envVar}`,
    "    authHeader: true",
    "    models:",
    models,
  ].join("\n");
}

export function insertProvider(existing: string, providerId: string, block: string): string {
  if (new RegExp(`^  ${providerId}:\\s*$`, "m").test(existing)) {
    throw new Error(`Provider ${providerId} already exists in models.yml.`);
  }
  const trimmedBlock = block.replace(/\s+$/, "");
  if (!existing.trim()) return `providers:\n${trimmedBlock}\n`;
  const lines = existing.split("\n");
  const providersIndex = lines.findIndex((line) => /^providers:\s*$/.test(line));
  if (providersIndex === -1) {
    const suffix = existing.endsWith("\n") ? "" : "\n";
    return `${existing}${suffix}providers:\n${trimmedBlock}\n`;
  }
  lines.splice(providersIndex + 1, 0, ...trimmedBlock.split("\n"));
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

export function upsertEnvAssignment(existing: string, name: string, value: string): string {
  if (new RegExp(`^${name}=`, "m").test(existing)) return existing;
  const suffix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  return `${existing}${suffix}${name}=${value}\n`;
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const backup = `${path}.bak`;
  const temporary = `${path}.${process.pid}.tmp`;
  const hadOriginal = existsSync(path);
  if (hadOriginal) copyFileSync(path, backup);
  try {
    writeFileSync(temporary, contents, { mode: 0o600 });
    renameSync(temporary, path);
  } catch (error) {
    if (hadOriginal && existsSync(backup)) copyFileSync(backup, path);
    throw error;
  }
}

export function writeCustomProvider(files: ProviderFiles, input: CustomProviderInput, secret?: string): void {
  const problem = validateCustomProvider(input);
  if (problem) throw new Error(problem);
  if (secret && (secret.includes("\n") || secret.includes("\r"))) {
    throw new Error("The API key must be a single line.");
  }
  const existing = existsSync(files.modelsPath) ? readFileSync(files.modelsPath, "utf8") : "";
  const next = insertProvider(existing, input.providerId, renderProviderBlock(input));
  if (secret && next.includes(secret)) {
    throw new Error("Refusing to write the API key into models.yml.");
  }
  atomicWrite(files.modelsPath, next);
  if (!secret) return;
  const currentEnv = existsSync(files.envPath) ? readFileSync(files.envPath, "utf8") : "";
  atomicWrite(files.envPath, upsertEnvAssignment(currentEnv, input.envVar, secret));
}

export async function probeModelIds(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | undefined> {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    const ids = (body.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return ids.length > 0 ? ids : undefined;
  } catch {
    return undefined;
  }
}
