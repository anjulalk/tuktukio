# Client Agent Guide

This directory contains the browser client: rendering, input, HUD, local prediction, and the network adapter.

## Boundaries

- The client may predict local driving and visual effects.
- The client must not decide cash, passenger ownership, fare settlement, combat outcomes, or respawn eligibility.
- Server messages are the source of truth for player/economy state.
- `shared/protocol.ts` is the wire contract; validate incoming messages before using them.

## Working rules

- Keep rendering and gameplay state separated enough that protocol changes do not leak unsafe casts through the UI.
- Reuse procedural assets and shared materials; do not add heavyweight external assets without a documented reason.
- Dispose or remove remote scene objects when players leave.
- Keep input, prediction, and reconciliation understandable.
- Preserve keyboard and touch controls; avoid disabling browser zoom.
- Use `performance.now()` for client timing and server timestamps for authoritative timing.

## Validation

For client changes:

```bash
npm run typecheck
npm test
npm run worker:check
```

For networking or rendering changes, test at least:

- One player offline/local Node mode.
- Two browser windows against `npm run worker:dev`.
- Reconnect after a forced WebSocket close.
- Wreck/respawn and passenger pickup/drop.
- Narrow mobile viewport and touch controls.

## Relevant files

- `client/src/main.ts` — bootstrap, scene, HUD, input, and render loop.
- `client/src/net/lobby.ts` — HTTP lobby client.
- `client/src/net/socket.ts` — admission, WebSocket, reconnect, and protocol parsing.
- `client/src/drive/tuk.ts` — local kinematic prediction.
- `client/src/city/roadGraph.ts` — procedural road graph.
- `client/src/env/` — procedural environment and people.
