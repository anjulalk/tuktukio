# Worker Agent Guide

This directory is the production runtime: Worker routing, Room Durable Objects, and sharded Lobby Durable Objects.

## Runtime model

- `worker/src/index.ts` owns HTTP routes, admission checks, room WebSockets, and the `TukTukRoom` DO.
- `worker/src/lobby.ts` owns `TukTukLobby` DO state, sharding helpers, tickets, queues, reservations, and alarms.
- Each room is serialized by one `TukTukRoom` instance.
- Named rooms hash to a stable lobby shard. Quick Play hashes the edge region.
- Durable Object state is versioned and must be migrated defensively.

## Security invariants

- Never accept a WebSocket without a valid, unexpired, room-scoped admission ticket.
- Validate origin, request size, message size, message rate, input sequence, movement bounds, and heartbeat.
- Keep secrets in Wrangler/GitHub secrets only.
- Do not log ticket IDs, tokens, player names, or raw request bodies.
- Preserve `Cache-Control: no-store` on API responses.

## Gameplay invariants

The Worker is authoritative for:

- Player position/speed/heading acceptance.
- Passenger ownership and pickup/drop validation.
- Fare calculation, cash, delivered count, and passenger respawn.
- Hearts, combat, wrecked state, and respawn leases.
- Snapshot and welcome state sent to clients.

Client-reported actions are requests, not facts. Recheck ownership, range, speed, alive state, and cooldown on the server.

## Durable Object changes

Before changing persisted state:

1. Update the state version or add a Wrangler migration.
2. Make restore tolerant of old state.
3. Preserve unrelated storage keys; prefer namespaced deletes over `deleteAll()`.
4. Test hibernation/restart assumptions.
5. Update `docs/10-production.md` and `CHANGELOG.md`.

## Commands

```bash
npm run worker:typecheck
npm run worker:check
npm run worker:dev
npm run worker:deploy
```

Never deploy unless the user explicitly asks and the dry run passes.
