# Local Server Agent Guide

This directory contains the platform-neutral room primitives and the local Node WebSocket fallback.

## Scope

- `server/src/room.ts` is shared by the Cloudflare Worker and Node fallback.
- `server/src/index.ts` is a development fallback, not the production authority.
- `server/src/validate.ts` contains local/shared validation helpers where applicable.

## Rules

- Do not create a second economy or combat implementation in the Node server.
- Prefer moving pure rules into `shared/` or `server/src/room.ts`.
- Keep fallback behavior aligned with the Worker protocol.
- Do not present fallback-only limitations as production guarantees.
- Remove or update stale comments that claim behavior the code does not implement.

## Validation

```bash
npm run typecheck
npm run worker:typecheck
npm test
```

When changing the shared room, test both `npm run server:dev` and `npm run worker:dev`.
