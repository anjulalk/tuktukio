# TukTuk.io — Production Runbook

## Deploy

```bash
npm ci
npx wrangler login
npm test
npm run worker:check
npm run worker:deploy
```

The deploy creates/updates SQLite-backed Durable Objects:

- `TukTukRoom` — one authoritative WebSocket room per room id
- `TukTukLobby` — eight sharded allocators (`lobby-n0`…`lobby-n7` / `lobby-q0`…`lobby-q7`) for named-room allocation, Quick Play, reservations, and wait queues

Attach `tuktuk.io` (or a subdomain) as a Cloudflare **Custom Domain** after the first deploy. The Worker serves the Vite build and the API/WebSocket routes from the same origin. If the client is hosted separately, set `ALLOWED_ORIGINS` in `wrangler.jsonc` to a comma-separated list of exact origins.

## Health checks

- `GET /api/health` — process liveness
- `GET /api/ready` — required Worker bindings and Lobby Durable Object are reachable

Use `/api/health` for a liveness probe and `/api/ready` for a deployment/readiness probe.

## Abuse controls

- Lobby join/poll endpoints use the Cloudflare Rate Limiting binding; poll keys are ticket-scoped to avoid NAT collisions.
- Room messages are capped at 30 messages/second per connection; binary frames over 2KB are rejected.
- Admission tickets expire before becoming WebSocket connections; sessions require a join within 5s and heartbeat every 15s.
- The Worker requires an admission ticket for room WebSockets and validates it before waking a room DO.
- Browser WebSocket origins are restricted to the serving origin (localhost is allowed for split local development).
- Static responses include CSP, clickjacking, MIME-sniffing, referrer, and permissions headers.

Rate Limiting is intentionally best-effort and local to a Cloudflare location; it is not an accounting or billing system. If the account already uses namespace `184729`, choose another positive integer in `wrangler.jsonc`.

## Operations

- Worker/DO logs and observability are enabled in `wrangler.jsonc`.
- Room sockets are hibernatable when idle; active rooms currently use a 15Hz interval and must be included in duration/cost load tests.
- Empty rooms are cleaned after 15 minutes. Expired lobby reservations and idle room records are cleaned by alarms/request-time cleanup.
- Admission validates the ticket before routing to a room DO; WebSocket handshakes and lobby calls are rate-limited.
- Durable Object lifecycle uses the `v1` SQLite migration in `wrangler.jsonc`; stored values also carry `version: 1` and are migrated defensively on restore.
- Check Cloudflare Workers Logs for `lobby_rate_limited`, `room_socket_error`, `room_persist_failed`, and `lobby_rate_limiter_error` events.

## Rollback

Use Wrangler deployments/versions to roll back the Worker to the last known-good deployment. Durable Object storage is retained across code deployments, so test protocol migrations locally before changing room state schemas.

## Remaining launch work

The current slice now has server-owned passenger ownership, pickup/drop validation, fare settlement, cash/delivery reconciliation, and a 30-second admission-ticket reconnect lease. It still has no persistent account/session system or Quick Play bots/minimum-human hold, and room world generation currently uses the fixed seed 7 rather than rebuilding the client scene from the welcome seed. Before a public competitive launch, add bots or an explicit solo policy, implement per-room seed/world handoff, add compact/interest-managed netcode, and load-test the target CCU.
