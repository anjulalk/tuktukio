# TukTuk.io Agent Guide

Read this file before changing the repository. It is the source of truth for AI-assisted work in the project root. If a directory contains its own `AGENTS.md`, that file adds local rules and takes precedence for that directory.

## Project identity

- Product: TukTuk.io multiplayer tuk-tuk game
- Live URL: <https://tuktukio.anjula.dev>
- Repository: <https://github.com/anjulalk/tuktukio>
- Runtime: TypeScript, Vite, Three.js, Cloudflare Workers, Durable Objects
- Local fallback: Node.js + `ws`
- License: MIT

## Read order

1. This file.
2. The nearest subsystem `AGENTS.md`:
   - `client/AGENTS.md`
   - `worker/AGENTS.md`
   - `server/AGENTS.md`
   - `shared/AGENTS.md`
   - `docs/AGENTS.md`
3. [docs/README.md](docs/README.md) for the documentation map.
4. The relevant `skills/*/SKILL.md` playbook.
5. Relevant records in `docs/adr/` for architectural decisions.
6. Existing tests and neighboring code before editing.

## Non-negotiable rules

- Never commit credentials, API tokens, `.dev.vars`, `.env.local`, or Cloudflare account data.
- Never print, log, echo, or paste secrets into an issue, PR, commit, or chat.
- Do not change the authoritative protocol without updating `shared/protocol.ts`, both runtimes, client parsing, tests, and multiplayer documentation.
- Do not make the browser authoritative for cash, passenger ownership, pickup/drop, combat, or respawn state.
- Do not silently weaken validation, rate limits, origin checks, admission tickets, or security headers.
- Preserve the public API paths and the existing room/ticket behavior unless a migration is explicitly planned.
- Do not deploy to production without an explicit user request and a passing `npm run worker:check`.
- Do not describe roadmap items as shipped. Mark current behavior versus target behavior in docs.

## Golden commands

```bash
npm ci
npm run typecheck
npm run worker:typecheck
npm test
npm run worker:check
npm run worker:dev
```

Run the narrowest relevant test first, then the full check before proposing a commit or deployment.

## Architecture boundaries

- `worker/src/index.ts` owns HTTP routing, admission validation, Room DO lifecycle, WebSocket validation, authoritative actions, and snapshots.
- `worker/src/lobby.ts` owns sharded allocation, tickets, reservations, waiters, grace leases, and lobby alarms.
- `server/src/room.ts` is the platform-neutral room/economy/combat primitive used by Worker and Node fallback.
- `shared/` is dependency-light and shared by browser, Worker, and Node code.
- `client/` owns prediction, rendering, input, UI, and visual feedback only.

## Safe change workflow

1. State the user-visible goal and affected boundary.
2. Read the nearest `AGENTS.md` and relevant docs.
3. Make the smallest coherent change.
4. Add or update tests for pure logic and protocol invariants.
5. Run typechecks, tests, and the Worker dry run.
6. Update the relevant docs and agent context if behavior or commands changed.
7. Review `git diff` for secrets, generated files, and unrelated changes.
8. Commit with a descriptive message only after validation.

## Protocol and persistence changes

Protocol changes require:

- Runtime validation in the Worker and client.
- Node fallback compatibility where practical.
- A version/migration decision for persisted state.
- Documentation in `docs/08-multiplayer.md` and/or `docs/10-production.md`.
- A test for the new invariant.

Durable Object schema changes require a `wrangler.jsonc` migration tag, defensive restore logic, and a rollback note.

## Deployment safety

The production Worker is deployed from `main` through `.github/workflows/deploy.yml`. GitHub Actions requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets. The account ID is not a substitute for a scoped API token.

For a manual deployment:

```bash
npx wrangler login
npm test
npm run worker:check
npm run worker:deploy
```

After deployment, verify both:

```text
https://tuktukio.anjula.dev/api/health
https://tuktukio.anjula.dev/api/ready
```

## Definition of done

A change is ready when it has:

- A clear implementation and no unrelated cleanup.
- Typechecks for affected runtimes.
- Tests for changed pure logic or protocol behavior.
- A passing Worker dry run for Worker/config/protocol changes.
- Updated user/developer/AI context where needed.
- No secrets or generated build output in the diff.
