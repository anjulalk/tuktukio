# Gameplay and Protocol Skill

Use this skill for driving, passengers, fares, combat, snapshots, or client/server protocol changes.

## Start here

- `AGENTS.md`
- `shared/AGENTS.md`
- `worker/AGENTS.md` and `server/AGENTS.md`
- `docs/08-multiplayer.md`

## Invariants

- The Worker decides player state, passenger ownership, fares, cash, deliveries, hearts, and respawn eligibility.
- Client `input`, `pick`, `drop`, and `cut` messages are requests and must be validated again on the server.
- Movement messages are sequenced and sanity-checked against elapsed time, speed, heading, world bounds, and heartbeat state.
- Snapshot/welcome/passenger messages need runtime validation on the client.
- Preserve the 30-second reconnect grace behavior and room/ticket semantics unless a migration is designed.

## Change checklist

1. Update the shared type.
2. Update Worker and Node parsing/handling.
3. Update client parsing and visual/state reconciliation.
4. Add pure tests for the new rule.
5. Run `npm test`, `npm run typecheck`, `npm run worker:typecheck`, and `npm run worker:check`.
6. Test two clients in a local Worker for state changes.
7. Update `docs/08-multiplayer.md` and `CHANGELOG.md`.

## Do not

- Trust a client fare, cash, passenger owner, hit result, or respawn result.
- Add a second independent economy to the client or Node fallback.
- Add protocol fields without a validation path.
