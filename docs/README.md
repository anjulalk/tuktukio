# TukTuk.io Documentation

This directory is the durable product and engineering context for the game.

## Recommended reading order

1. [`01-vision-scope.md`](01-vision-scope.md) — product scope.
2. [`02-functional-requirements.md`](02-functional-requirements.md) and [`03-non-functional-requirements.md`](03-non-functional-requirements.md) — requirements and targets.
3. [`06-architecture.md`](06-architecture.md) — runtime architecture and current/target boundaries.
4. [`08-multiplayer.md`](08-multiplayer.md) — protocol, lobby, room, and reconnect behavior.
5. [`10-production.md`](10-production.md) — deployment and operations runbook.
6. [`11-ai-agent-context.md`](11-ai-agent-context.md) — AI agent context and task routing.
7. [`../skills/README.md`](../skills/README.md) — task-specific playbooks.

## Documentation rules

- Requirements describe goals; source code and the production runbook describe current behavior.
- Target metrics are not claims of measurement.
- Protocol and persistence changes must update the relevant documents.
- Secrets and private runtime data never belong in documentation.
