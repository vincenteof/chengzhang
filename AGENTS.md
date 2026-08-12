<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Code style and pre-commit checks

Formatting and lint rules live in config — follow them, do not restate full rule lists here:

- Prettier: `prettier.config.js`
- ESLint: `eslint.config.js` (extends `@tanstack/eslint-config`)
- TypeScript: `tsconfig.json` / `tsconfig.node.json`

Before finishing a code change (and especially before commit), ensure these pass:

```bash
pnpm exec prettier --write <changed-files>   # or: pnpm format
pnpm exec eslint <changed-files> --max-warnings 0
pnpm typecheck
pnpm test
```

Treat failures as blocking. Prefer fixing style while writing; use config files as the source of truth when unsure.
