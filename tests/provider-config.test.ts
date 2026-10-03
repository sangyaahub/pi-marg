import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  probeModelIds,
  validateCustomProvider,
  writeCustomProvider,
  type CustomProviderInput,
} from "../core/provider-config";

const cheaper = `providers:
  cheaperinference:
    baseUrl: https://api.cheaperinference.com/v1
    api: openai-completions
    apiKey: CHEAPER_INFERENCE_API_KEY
    models:
      - id: kimi-k3
        name: Kimi K3
`;

const draft: CustomProviderInput = {
  providerId: "example-gateway",
  displayName: "Example Gateway",
  baseUrl: "https://example.test/v1",
  envVar: "EXAMPLE_GATEWAY_API_KEY",
  modelIds: ["model-a", "model-b"],
  allowLocalHttp: false,
};

describe("custom provider config", () => {
  test("writes the env var name into models.yml and the secret only into .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-marg-provider-"));
    const modelsPath = join(dir, "models.yml");
    const envPath = join(dir, ".env");
    writeFileSync(modelsPath, cheaper);
    writeCustomProvider({ modelsPath, envPath }, draft, "super-secret-value");

    const yaml = readFileSync(modelsPath, "utf8");
    const env = readFileSync(envPath, "utf8");
    expect(yaml).toContain("apiKey: EXAMPLE_GATEWAY_API_KEY");
    expect(yaml).toContain("id: model-a");
    expect(yaml).toContain("id: model-b");
    expect(yaml).toContain("cheaperinference:");
    expect(yaml).toContain("CHEAPER_INFERENCE_API_KEY");
    expect(yaml).not.toContain("super-secret-value");
    expect(env).toContain("EXAMPLE_GATEWAY_API_KEY=super-secret-value");
    expect(env).not.toContain("apiKey:");
  });

  test("rejects an invalid provider id, a remote http URL, and duplicate model ids", () => {
    expect(validateCustomProvider({ ...draft, providerId: "Example" })).toMatch(/provider id/i);
    expect(validateCustomProvider({ ...draft, baseUrl: "http://example.test/v1" })).toMatch(/https/i);
    expect(validateCustomProvider({
      ...draft,
      baseUrl: "http://127.0.0.1:8080/v1",
      allowLocalHttp: true,
    })).toBeUndefined();
    expect(validateCustomProvider({ ...draft, modelIds: ["model-a", "model-a"] })).toMatch(/unique/i);
    expect(validateCustomProvider({ ...draft, envVar: "lower_case" })).toMatch(/env/i);
  });

  test("probes live ids without replacing an explicit model list or writing the secret into yaml", async () => {
    const seen = new Map<string, string>();
    const ids = await probeModelIds("https://example.test/v1", "super-secret-value", async (url, init) => {
      const headers = new Headers(init?.headers);
      seen.set(String(url), headers.get("Authorization") ?? "");
      return new Response(JSON.stringify({ data: [{ id: "guessed-model" }] }), { status: 200 });
    });
    expect(ids).toEqual(["guessed-model"]);
    expect(seen.get("https://example.test/v1/models")).toBe("Bearer super-secret-value");

    const dir = mkdtempSync(join(tmpdir(), "pi-marg-probe-"));
    const modelsPath = join(dir, "models.yml");
    writeCustomProvider({ modelsPath, envPath: join(dir, ".env") }, draft, "super-secret-value");
    const yaml = readFileSync(modelsPath, "utf8");
    expect(yaml).toContain("id: model-a");
    expect(yaml).not.toContain("guessed-model");
    expect(yaml).not.toContain("super-secret-value");
  });
});
