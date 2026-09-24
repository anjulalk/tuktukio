# AI Agent Context Map

This file is the short orientation guide for coding agents and automation. Read the root [`AGENTS.md`](../AGENTS.md) first, then the nearest subsystem guide.

## Source-of-truth order

1. Source code and tests for current behavior.
2. `worker/AGENTS.md`, `server/AGENTS.md`, `client/AGENTS.md`, and `shared/AGENTS.md` for local constraints.
3. This file for task routing.
4. Product docs for goals and roadmap.
5. `skills/` for execution playbooks.
6. `docs/adr/` for durable architecture decisions.

If a document conflicts with code, do not silently assume the document is correct. Verify the code, update the document, and call out the discrepancy.

## Task routing

| Task | Read first | Validate with |
| --- | --- | --- |
| Client/UI/rendering | `client/AGENTS.md`, `docs/09-environment.md` | `npm run typecheck`, browser smoke |
| WebSocket/protocol | `shared/AGENTS.md`, `docs/08-multiplayer.md` | `npm test`, `npm run worker:check` |
| Room/gameplay | `worker/AGENTS.md`, `server/AGENTS.md` | `npm test`, two-client smoke |
| Lobby/queues | `worker/AGENTS.md`, `docs/08-multiplayer.md` | local Worker admission tests |
| Durable Object/storage | `worker/AGENTS.md`, `docs/10-production.md` | dry run, migration review |
| Deployment/CI | `docs/10-production.md`, `.github/workflows/` | `gh run list`, health/readiness |
| Documentation/AI context | `docs/AGENTS.md`, this file | link and command review |

## Stable terminology

- **Room DO**: one authoritative WebSocket/game-state object per room ID.
- **Lobby DO**: one allocation/ticket/queue shard.
- **Admission ticket**: short-lived bearer credential required before a WebSocket is accepted.
- **Grace lease**: 30-second reconnect window that holds a room slot and preserves player state.
- **Server authoritative**: the Worker decides state; the client predicts and renders.
- **Current**: implemented and validated behavior.
- **Target**: roadmap or requirement not yet guaranteed.

## Current boundaries

Release status is `0.1.0-alpha.1`: **alpha, not production-ready**.

Implemented: Worker/DO hosting, sharded lobby, named rooms, Quick Play, ticket-gated sockets, server-authoritative fare/combat/respawn, reconnect grace, rate limits, security headers, CI/deploy workflows.

Not yet complete: persistent accounts, Quick Play bots/minimum-human policy, full server-side vehicle simulation, compact netcode, target-CCU load results, and per-room world seed handoff. Known bugs are tracked in [`../STATUS.md`](../STATUS.md).

## Change protocol

For a cross-cutting change, write down:

- affected boundary;
- old and new state/message shape;
- migration and rollback;
- validation plan;
- documentation updates;
- deployment impact.

Do not put credentials or bearer tickets in the context files.
