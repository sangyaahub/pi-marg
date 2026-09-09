# Language skill routing

Load language guidance only after the repository language is observed. On existing repositories, detect this from CodeGraph's file/language summary, not a grep/glob crawl.

Use the smallest relevant subset. Do not install an entire large collection merely because one language is present.

## Go

Repository: `https://github.com/samber/cc-skills-golang`

Suggested base:

```bash
npx skills add samber/cc-skills-golang --skill golang-code-style
npx skills add samber/cc-skills-golang --skill golang-error-handling
npx skills add samber/cc-skills-golang --skill golang-testing
```

Add concurrency, security, performance, or gopls skills only when that concern exists.

## Python

Repository: `https://github.com/wshobson/agents`

Suggested base:

```bash
npx skills add wshobson/agents --skill python-code-style
npx skills add wshobson/agents --skill python-type-safety
npx skills add wshobson/agents --skill python-testing-patterns
```

Add async, packaging, performance, or error-handling guidance only when relevant.

## TypeScript

Repositories: `https://github.com/wshobson/agents` and `https://github.com/cursor/plugins`

Suggested base:

```bash
npx skills add cursor/plugins --skill typescript-best-practices
npx skills add wshobson/agents --skill javascript-testing-patterns
```

Load `typescript-advanced-types` only when the change genuinely needs non-trivial type-level design; it is not a default style guide.

## Stage rule

- Stage A: load architecture/style guidance only when it informs a material design decision.
- Stage B: load the base style and testing skills for languages in the actual edit scope.
- Stage C/D: load the relevant language review/testing guidance, not every build skill again.

These are community skills. Review the selected `SKILL.md`, repository activity, license, requested tools, and current skills.sh security signals before global installation. After installation, verify the exact skill appears in the active Pi or OMP inventory; otherwise treat it as unavailable.
