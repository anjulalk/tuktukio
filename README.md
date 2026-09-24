# TukTuk.io

[![ci](https://img.shields.io/github/actions/workflow/status/anjulalk/tuktukio/ci.yml?branch=main&label=ci&labelColor=44403a&style=flat-square)](https://github.com/anjulalk/tuktukio/actions/workflows/ci.yml)
[![deploy](https://img.shields.io/github/actions/workflow/status/anjulalk/tuktukio/deploy.yml?branch=main&label=deploy&labelColor=44403a&style=flat-square)](https://github.com/anjulalk/tuktukio/actions/workflows/deploy.yml)
[![live](https://img.shields.io/badge/live-tuktukio.anjula.dev-5f5a51?labelColor=44403a&style=flat-square)](https://tuktukio.anjula.dev)
[![node](https://img.shields.io/badge/node-22-5f5a51?labelColor=44403a&style=flat-square)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-MIT-c1603c?labelColor=44403a&style=flat-square)](LICENSE)
[![last commit](https://img.shields.io/github/last-commit/anjulalk/tuktukio?labelColor=44403a&style=flat-square)](https://github.com/anjulalk/tuktukio/commits/main)
[![stars](https://img.shields.io/github/stars/anjulalk/tuktukio?style=flat-square&labelColor=44403a)](https://github.com/anjulalk/tuktukio/stargazers)
[![forks](https://img.shields.io/github/forks/anjulalk/tuktukio?style=flat-square&labelColor=44403a)](https://github.com/anjulalk/tuktukio/network/members)
[![issues](https://img.shields.io/github/issues/anjulalk/tuktukio?style=flat-square&labelColor=44403a)](https://github.com/anjulalk/tuktukio/issues)

**TukTuk.io** is a lightweight, browser-based multiplayer tuk-tuk game. Pick up passengers, race through the city, cut off rivals, and deliver fares in shared rooms.

**Live game:** <https://tuktukio.anjula.dev>

Built by [Anjula Karunarathne](https://anjula.dev).

## What is implemented

- Named rooms with normalized names and a bounded waitroom.
- Quick Play using region-hashed public rooms.
- Cloudflare Workers routing and ticket-gated WebSockets.
- SQLite-backed Room and sharded Lobby Durable Objects.
- Server-authoritative passengers, pickup/drop ownership, fares, cash, deliveries, hearts, and respawns.
- Sequenced movement validation, origin checks, rate limiting, admission leases, and reconnect grace.
- Lightweight procedural Three.js rendering with no external art assets.
- Touch driving controls, responsive HUD, minimap, procedural city dressing, and keyboard controls.

## Architecture

```text
Browser / Three.js
        │
        │ HTTPS + WebSocket
        ▼
Cloudflare Worker
        │
        ├── Sharded TukTukLobby Durable Objects
        │     ├── named-room allocation
        │     ├── Quick Play selection
        │     ├── admission tickets
        │     └── waitroom/promotion
        │
        └── TukTukRoom Durable Object per room
              ├── authoritative player state
              ├── passengers and fares
              ├── combat and respawns
              ├── reconnect grace
              └── room heartbeat/cleanup
```

The Worker serves the Vite build and the API/WebSocket routes from the same origin. GitHub stores the source and runs CI/CD; GitHub Pages is not used for the game runtime and cannot host Durable Objects or WebSockets.

## Quick start

Requirements:

- Node.js 22 or newer
- npm
- A Cloudflare account for production deployment

```bash
npm ci
npm run worker:dev
```

Open the local URL printed by Wrangler. For split local development, set `VITE_MULTIPLAYER_URL=ws://localhost:8787` in `.env.local`.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite frontend development server |
| `npm run worker:dev` | Local Worker + Durable Object runtime |
| `npm run server:dev` | Local Node fallback server |
| `npm run typecheck` | Client/shared TypeScript checks |
| `npm run worker:typecheck` | Worker TypeScript checks |
| `npm test` | Pure room/protocol tests |
| `npm run worker:check` | Build, typecheck, and Wrangler dry run |
| `npm run worker:deploy` | Build and deploy the Cloudflare Worker |

## Production deployment

The production domain is `tuktukio.anjula.dev`.

### Manual deployment

```bash
npx wrangler login
npm test
npm run worker:check
npm run worker:deploy
```

The custom domain route is declared in `wrangler.jsonc`. Keep `workers_dev: true` until the custom domain has been verified; it provides a safe fallback URL during deployment.

### GitHub Actions deployment

Pushes to `main` run CI and then deploy through Cloudflare. The repository requires these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Never commit `.dev.vars`, `.env.local`, API tokens, or account credentials. See [SECURITY.md](SECURITY.md) and [docs/10-production.md](docs/10-production.md).

## Repository map

```text
client/       Browser client, rendering, input, HUD, and net client
server/       Shared room primitives and local Node fallback
shared/       Protocol, types, cutoff, fare, and deterministic utilities
worker/       Cloudflare Worker, Room DO, and sharded Lobby DO
public/       Static assets, headers, manifest, robots, and favicon
tests/        Fast pure-logic tests
docs/         Product, architecture, multiplayer, and operations context
skills/       Task-specific AI agent playbooks
.github/      CI/CD, repository policy, templates, and Dependabot
```

## AI agent context

This repository is designed to be safe for AI-assisted development:

- Start with [`AGENTS.md`](AGENTS.md).
- Read the nearest nested `AGENTS.md` before editing a subsystem.
- Copilot instructions live in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
- Task playbooks live in [`skills/`](skills/).
- Product and architecture context lives in [`docs/`](docs/README.md).
- Current/target boundaries are explicitly marked in the documentation; do not treat roadmap items as implemented behavior.

## Current limitations and roadmap

The current public slice intentionally does not yet include persistent accounts, Quick Play bots, a full server-side vehicle simulation, compact delta netcode, or target-CCU load-test results. These are tracked in [docs/10-production.md](docs/10-production.md), not hidden as completed work.

## License

MIT — see [LICENSE](LICENSE). Built by [Anjula Karunarathne](https://anjula.dev).
