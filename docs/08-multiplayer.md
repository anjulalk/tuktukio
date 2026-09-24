# TukTuk.io — Multiplayer Slice (08)

> 15Hz authoritative rooms + cut-off combat. TS strict, shared protocol.

## Run
- `npm run server:dev` → local Node fallback at `ws://localhost:8081`.
- `npm run worker:dev` → Cloudflare Worker + Durable Object local runtime (normally `http://localhost:8787`).
- `npm run dev` → Vite client; set `VITE_MULTIPLAYER_URL=ws://localhost:8787` in `.env.local` to use the Worker during split local development.
- A deployed Worker serves the client and `/ws/{roomId}` from the same origin. Add `?room=colombo` to auto-join the named room `colombo`.

## Cloudflare deploy

```bash
npx wrangler login
npm run worker:deploy
```

The first deploy creates the SQLite-backed `TukTukRoom` and `TukTukLobby` Durable Objects. Set `VITE_MULTIPLAYER_URL` only when the client and Worker are hosted on different origins; otherwise the same-origin `/api/lobby/*` and `/ws/{roomId}` routes are used automatically.

## Protocol (`shared/protocol.ts`)
- `join {name}` → `welcome {id, seed, roomId, x, z, heading, speed, hearts, alive, respawnAt, cash, delivered}` (after lobby admission)
- `ping` is sent every 15s; the room closes sessions silent for 45s.
- WebSocket URL: `/ws/{roomId}?ticket={admissionTicket}`; direct room sockets without a ticket are rejected.
- `input {seq,x,z,heading,speed}` @10Hz up; the Worker validates sequence, elapsed-time distance, acceleration, and turn rate.
- `snap {tick,players}` @15Hz down. This is currently full JSON (not delta-compressed); the `<20kbps` figure is a target, not a current guarantee.
- `cut {victimId}` → `hit {attackerId,victimId,heartsLeft}` → `wrecked {victimId,killerId,cashStolen,respawnAt}` on the 3rd hit.
- `pick {pid}` / `drop {pid}` → `passenger {passenger,playerId,cash,delivered}` after server range/ownership/seat validation.
- `respawn` → `respawned {id,x,z,heading,hearts,shieldMs}` after the server-owned 3s lease.

- Named-room admission: `POST /api/lobby/join` finds an open room by normalized name or creates one. Full named rooms return `queued`; clients poll `POST /api/lobby/poll` with their `lobbyId` and only open `/ws/{roomId}?ticket=...` after admission.
- Quick Play sends `mode: "quick"`; the Lobby DO consolidates players into an open public room and creates another public room when one is full, so solo players can join random people without entering a named room.
- The lobby is sharded across eight serialized Durable Objects: named rooms hash to a stable shard, while Quick Play hashes the edge region. Reservations still cannot oversubscribe a room. A reservation expires if the client does not connect; an admitted socket gets a 30-second reconnect grace lease that restores the same player id/state. Named waiters are promoted when that lease expires.

## Authority (`worker/src/index.ts`, `worker/src/lobby.ts`, `server/src/room.ts`, `validate.ts`)
- The Cloudflare Durable Object is the room authority; the local Node server remains a development fallback.
- Same pure `isCutOff()` as client. Rejects: range>4m, heading>30°, attacker slower, 3s attacker CD, 5s victim immune, 10s spawn safe.
- `applyHit`: hearts-1, 3rd hit steals 20% cash + kill. Retention: fares stay bound — only cash/hearts mutate.
- Movement is sampled-position validation, not a full server-side vehicle simulation; production launch work should move to authoritative control/tick simulation.
- Respawn is server-owned and sends a fresh position/hearts/shield lease. Passenger ownership, pickup/drop validation, fare calculation, cash, and delivery count are now server-owned; the client renders and predicts only.

## Client (`client/src/net/socket.ts`, `main.ts`)
- Remote red Tuks with 8/s lerp interp, red minimap dots.
- SPACE cut nearest within 4m (server decides). Kill-feed `#feed`, hearts from server.
- Wreck overlay keeps the local `aboard[]` presentation; Play Again asks the room authority to respawn after the 3s lease and applies the 8s shield when the server confirms.

## Next
- Bots to fill <6 humans, a persistent account/session system, compact delta netcode, and target-CCU load validation remain launch work. The current 30-second admission-ticket reconnect lease is implemented.
