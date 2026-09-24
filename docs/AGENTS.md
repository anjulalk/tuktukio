# Documentation Agent Guide

Documentation is part of the product contract for this repository.

## Rules

- Keep current behavior separate from target/roadmap behavior.
- Link to the relevant source file when documenting a rule.
- Use relative Markdown links.
- Do not paste secrets, tokens, admission tickets, private room data, or account IDs into public docs.
- Prefer concise runbooks with copy-pasteable commands.
- Update `CHANGELOG.md` for user-visible or operational changes.

## Documentation map

- `docs/README.md` — index and reading order.
- `docs/06-architecture.md` — system design and current/target boundaries.
- `docs/08-multiplayer.md` — protocol, lobby, and reconnect behavior.
- `docs/10-production.md` — deployment, operations, rollback, and launch gaps.
- `docs/11-ai-agent-context.md` — AI context map and task routing.
- `skills/` — focused playbooks for agents.

When code and documentation disagree, fix the documentation in the same change and state which behavior is authoritative.
