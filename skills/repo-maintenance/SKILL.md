# Repository Maintenance Skill

Use this skill for documentation, CI, repository metadata, tests, and release preparation.

## Start here

- `AGENTS.md`
- `docs/AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

## Checklist

- Keep README commands executable and links relative.
- Keep current behavior separate from roadmap claims.
- Update the nearest subsystem `AGENTS.md` when an invariant changes.
- Add tests with behavior changes.
- Run the full validation set before committing.
- Check for secrets and generated files with `git diff` and `git status`.
- Use the repository issue/PR templates for public collaboration.

## AI context maintenance

When adding a new subsystem, add:

- a directory-level `AGENTS.md`;
- a docs index entry;
- a focused skill if agents need a repeatable procedure;
- a link from the root `AGENTS.md` if it changes the reading order.

Do not duplicate the same operational instructions in many files; link to the source-of-truth document instead.

## Release preparation

1. Update `CHANGELOG.md`.
2. Run `npm test`, `npm run typecheck`, `npm run worker:typecheck`, and `npm run worker:check`.
3. Review open issues and deployment workflow status.
4. Verify the live health/readiness endpoints.
5. Confirm the GitHub deployment secrets exist without printing their values.
