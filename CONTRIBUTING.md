# Contributing to TukTuk.io

Thanks for helping improve TukTuk.io. The project is open source under the [MIT License](LICENSE).

## Before you start

- Read [`AGENTS.md`](AGENTS.md).
- Check open issues and pull requests.
- For a substantial change, open an issue describing the user-visible outcome and compatibility impact.
- Never include secrets in an issue, pull request, screenshot, log, or patch.

## Local setup

Requirements: Node.js 22+ and npm.

```bash
npm ci
npm run worker:dev
```

Useful URLs:

- Worker local runtime: usually `http://localhost:8787`
- Vite dev server: usually `http://localhost:5173`
- Health: `/api/health`
- Readiness: `/api/ready`

For the Node fallback:

```bash
npm run server:dev
```

## Development rules

- Keep browser code predictive/rendering-focused.
- Keep gameplay authority in `worker/` and `server/src/room.ts`.
- Update both runtimes and the shared protocol when changing the wire format.
- Add tests for pure rules, validation, migrations, and protocol invariants.
- Prefer small, reviewable commits.
- Match existing naming, formatting, and error-handling patterns.

See the subsystem guides:

- [`client/AGENTS.md`](client/AGENTS.md)
- [`worker/AGENTS.md`](worker/AGENTS.md)
- [`server/AGENTS.md`](server/AGENTS.md)
- [`shared/AGENTS.md`](shared/AGENTS.md)
- [`docs/AGENTS.md`](docs/AGENTS.md)

## Validation

Run:

```bash
npm run typecheck
npm run worker:typecheck
npm test
npm run worker:check
```

For multiplayer changes, also test two browser windows against a local Worker and verify named rooms, Quick Play, disconnect/reconnect, passenger pickup/drop, and wrecked/respawn behavior.

## Pull requests

Keep the pull request focused and include:

- What changed and why.
- User-visible behavior.
- Tests run.
- Migration/deployment impact, if any.
- Screenshots or a short recording for visual changes.
- A note for any known limitation.

Use a clear conventional-ish title such as `fix: reject stale room tickets` or `feat: add server-authoritative fare events`.

## Deployment

Merges or pushes to `main` deploy through GitHub Actions after CI succeeds. Do not deploy manually unless coordinating a release or responding to an incident. See [`docs/10-production.md`](docs/10-production.md).

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Security reports should follow [`SECURITY.md`](SECURITY.md), not the public issue tracker.
