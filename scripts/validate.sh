#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$(cd "${script_dir}/.." && pwd)"
build_dir="$(mktemp -d)"
trap 'rm -rf "${build_dir}"' EXIT

cd "${package_root}"

for script in scripts/*.sh; do
  bash -n "${script}"
done

bun -e '
  import { existsSync } from "node:fs";
  const isMapping = (value) =>
    value !== null && !Array.isArray(value) && typeof value === "object";

  function assertNpmPublishWorkflow(workflow, path) {
    const publish = workflow.jobs.publish;
    const steps = publish?.steps;
    const setupNode = steps?.find((step) => step?.uses === "actions/setup-node@v7");
    const commands = steps?.map((step) => step?.run).filter(Boolean) ?? [];

    if (
      !isMapping(workflow.on) ||
      !("workflow_dispatch" in workflow.on) ||
      workflow.permissions?.contents !== "read" ||
      workflow.permissions?.["id-token"] !== "write" ||
      !isMapping(publish) ||
      publish.if !== "github.ref == \u0027refs/heads/main\u0027" ||
      publish.environment !== "npm-publish" ||
      publish["runs-on"] !== "ubuntu-latest" ||
      !Array.isArray(steps) ||
      setupNode?.with?.["node-version"] !== 24 ||
      setupNode?.with?.["registry-url"] !== "https://registry.npmjs.org" ||
      setupNode?.with?.["package-manager-cache"] !== false ||
      !commands.includes("npm publish --provenance")
    ) {
      throw new Error(`Unsafe npm publishing workflow: ${path}`);
    }
  }

  const packageJson = await Bun.file("package.json").json();
  const marketplace = await Bun.file(".omp-plugin/marketplace.json").json();
  if (packageJson.name !== "@sangyaahub/pi-marg") throw new Error("Unexpected package name");
  if (packageJson.version !== "1.0.4") throw new Error("package.json must be v1.0.4");
  if (packageJson.license !== "MIT") throw new Error("package.json must declare MIT");
  if (packageJson.author !== "Sangyaa") throw new Error("Unexpected package author");
  if (!packageJson.keywords?.includes("pi-package")) throw new Error("Pi catalog keyword is missing");
  if (packageJson.bin?.["pi-marg"] !== "bin/pi-marg.js") throw new Error("PiMarg CLI bin mapping is missing");
  if (!packageJson.files?.includes("bin")) throw new Error("PiMarg CLI is excluded from npm files");
  if (!existsSync("bin/pi-marg.js")) throw new Error("PiMarg CLI entry point is missing");
  if (marketplace.name !== "pi-marg-marketplace") throw new Error("Unexpected marketplace name");
  if (marketplace.metadata?.version !== packageJson.version) throw new Error("Marketplace version mismatch");
  if (marketplace.plugins?.[0]?.version !== packageJson.version) throw new Error("Plugin version mismatch");
  if (marketplace.plugins?.[0]?.name !== packageJson.name.split("/").at(-1)) throw new Error("Plugin/package name mismatch");
  if (marketplace.plugins?.[0]?.source !== "./") throw new Error("OMP local source must begin with ./");
  for (const relativePath of [
    ...(packageJson.pi?.extensions ?? []),
    ...(packageJson.pi?.skills ?? []),
    ...(packageJson.pi?.prompts ?? []),
    ...(packageJson.omp?.extensions ?? []),
  ]) {
    if (!existsSync(relativePath)) {
      throw new Error(`Manifest path does not exist: ${relativePath}`);
    }
  }
  const license = await Bun.file("LICENSE").text();
  if (!license.includes("MIT License") || !license.includes("Copyright (c) 2026 Sangyaa and PiMarg contributors")) {
    throw new Error("LICENSE is not the expected MIT license");
  }
  const demo = await Bun.file("demo/pi-marg-v1.0.html").text();
  if (!demo.includes("PiMarg") || !demo.includes("v1.0")) {
    throw new Error("Demo branding/version mismatch");
  }
  if (!existsSync("assets/pi-marg-banner.png") || !existsSync("assets/brand/sangyaa-mark.png")) {
    throw new Error("PiMarg brand assets are missing");
  }
  const readme = await Bun.file("README.md").text();
  if (!readme.includes("# PiMarg") || !readme.includes("sangyaahub/pi-marg")) {
    throw new Error("README branding or install target mismatch");
  }
  for await (const path of new Bun.Glob("skills/*/SKILL.md").scan(".")) {
    const text = await Bun.file(path).text();
    if (!text.startsWith("---\n") || !/\nname:\s*\S+/.test(text) || !/\ndescription:\s*.+/.test(text)) {
      throw new Error(`Invalid skill frontmatter: ${path}`);
    }
  }
  for await (const path of new Bun.Glob(".github/workflows/*.{yml,yaml}").scan(".")) {
    const text = await Bun.file(path).text();
    const workflow = Bun.YAML.parse(text);
    if (
      !isMapping(workflow) ||
      typeof workflow.name !== "string" ||
      !("on" in workflow) ||
      !isMapping(workflow.jobs)
    ) {
      throw new Error(`Invalid GitHub Actions workflow structure: ${path}`);
    }
    if (path === ".github/workflows/npm-deploy.yml") {
      assertNpmPublishWorkflow(workflow, path);
    }
  }
  for await (const path of new Bun.Glob("**/*").scan({ cwd: ".", onlyFiles: true })) {
    if (path === "scripts/validate.sh") continue;
    if (/\.(?:png|jpe?g|gif|webp)$/i.test(path)) continue;
    const text = await Bun.file(path).text();
    if (text.includes("*** Begin Patch") || text.includes("*** Add File:")) {
      throw new Error(`Patch marker leaked into artifact: ${path}`);
    }
  }
  console.log("[ok] manifests, paths, MIT license, demo, and skill frontmatter");
'

bun build core/*.ts adapters/pi/extensions/*.ts adapters/omp/extensions/*.ts \
  --outdir "${build_dir}" --target bun --external typebox >/dev/null

echo "[ok] TypeScript core and adapters compile"
echo "[ok] shell scripts parse"
