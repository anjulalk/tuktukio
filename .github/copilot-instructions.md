# TukTuk.io Copilot Instructions

Read the repository root [`AGENTS.md`](../AGENTS.md) before making changes. Follow the nearest `AGENTS.md` for the files being edited.

## Project boundaries

- `worker/` is the production Cloudflare runtime and authoritative game boundary.
- `server/` contains shared room primitives and a local Node fallback.
- `client/` owns prediction, rendering, input, HUD, and UI.
- `shared/` is platform-neutral protocol, types, and pure rules.

## Required checks

```bash
npm run typecheck
npm run worker:typecheck
npm test
npm run worker:check
```

## Safety

- Never add or expose API tokens, admission tickets, `.dev.vars`, or account credentials.
- Keep cash, passenger ownership, fares, combat, and respawn server-authoritative.
- Update protocol parsing, tests, and docs together.
- Do not call roadmap items implemented.
- Do not deploy unless explicitly requested.

## Style

Match the existing TypeScript style, keep changes focused, and update `CHANGELOG.md` for user-visible or operational changes. See `skills/` for focused workflows and `docs/11-ai-agent-context.md` for task routing.
