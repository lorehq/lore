# Contributing to Lore

Thanks for your interest in contributing. Lore is early-stage and we welcome bug reports, fixes, and ideas.

## Dev Setup

```bash
git clone https://github.com/lorehq/lore.git
cd lore
npm install
```

Requires **Node.js 18+**. No production dependencies — `npm install` pulls lint/format tooling only.

## Running Checks

```bash
npm test                              # node:test
npm run lint                          # ESLint
npm run format:check                  # Prettier
bash .lore/scripts/validate-consistency.sh  # 11 cross-reference checks
bash .lore/scripts/check-version-sync.sh   # .lore/config.json ↔ package.json
bash .lore/scripts/smoke-test.sh            # Fresh-clone bootstrap simulation
```

CI runs all of these on Ubuntu + macOS, Node 18 + 20.

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm test` and `bash scripts/validate-consistency.sh`
4. Open a pull request

## What We're Looking For

- Bug fixes with clear reproduction steps
- Documentation improvements
- Hook or script reliability improvements
- Test coverage for existing hooks and scripts

## Guidelines

- Keep changes focused — one concern per PR
- Match existing code style
- Run `bash scripts/validate-consistency.sh` before submitting
- Skills and agents use YAML frontmatter — see `.lore/skills/lore-create-skill/SKILL.md` for the format
- The `lore-*` prefix is reserved for framework-owned skills and agents — these are overwritten on sync. Operator-created skills and agents must not use this prefix

## Reporting Issues

Use [GitHub Issues](../../issues). For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.
