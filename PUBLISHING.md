# Publishing PiMarg

This checklist is for maintainers. Public mutations remain subject to PiMarg's one-use approval gates.

## Before a release

1. Update `package.json`, `.omp-plugin/marketplace.json`, and `CHANGELOG.md` to the same version.
2. Run `./scripts/validate.sh`, `bun test tests`, and `npm pack --dry-run`.
3. Smoke-test the package root with the supported Pi and OMP versions.
4. Inspect the packed file list for secrets, generated debris, and missing runtime files.

## GitHub and OMP

The public `sangyaahub/pi-marg` repository is itself an OMP marketplace because it contains `.omp-plugin/marketplace.json`.

Users add and install it with:

```bash
omp plugin marketplace add sangyaahub/pi-marg
omp plugin install --scope user pi-marg@pi-marg-marketplace
```

Create an annotated `v<version>` tag and GitHub release only after the matching commit is on `main` and the checks pass.

## Pi package catalog

Pi's package catalog discovers public npm packages carrying the `pi-package` keyword. PiMarg is published under SangyaaHub's npm scope as `@sangyaahub/pi-marg`.

First publication requires an npm-authenticated maintainer:

```bash
npm whoami
npm publish --access public
```

After npm indexes the package, search for `@sangyaahub/pi-marg` at `https://pi.dev/packages` and verify:

```bash
pi install npm:@sangyaahub/pi-marg
```

For later releases, prefer npm trusted publishing with GitHub OIDC and provenance instead of a long-lived repository token. Never commit npm credentials.

## Approval order

Use a fresh, exact one-use approval immediately before each public action:

```text
APPROVE ACTION: post-web
APPROVE ACTION: push-main
```

Repository creation, GitHub release creation, and npm publication are separate `post-web` actions. A main-branch push uses `push-main`.
