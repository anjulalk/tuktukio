# TukTuk.io — Architecture (06)

> Decides *how* we build `01-vision` + `02/03-requirements` + `05-user-stories` within NFR budget: <3MB, <5s, 60/30fps.
> Covers US-02, US-30, US-32 first (vertical slice).
>
> **As-built vs target:** the current Worker uses validated sampled movement, full JSON snapshots, server-owned combat/respawn/economy state, a 30-second reconnect lease, and a serialized lobby. Delta netcode, bots, a persistent account/session system, and target-CCU load validation remain target work; see `docs/10-production.md`.

## 1. System Overview

```
Browser Client (Three.js + Canvas HUD) <--WebSocket 15Hz--> Cloudflare Worker -> Sharded Lobby DOs (name/capacity) -> Room DO
        |                                                                  |
   Seeded proc-gen (deterministic from server seed)                  Authoritative: cash, pick/drop, positions
```

- Each room is one Durable Object instance: 12-20 players, isolated state, WebSocket Hibernation, and SQLite-backed room snapshots.
- A sharded set of `TukTukLobby` Durable Objects owns allocation. Named rooms hash to a stable shard; Quick Play hashes the edge region. Each shard joins an open room, creates a room, or returns a queue position when capacity is exhausted.
- Clients obtain a short-lived admission ticket before opening a WebSocket. This prevents queued players from consuming room connections.
- The Worker routes `/ws/{roomId}` to the correct Durable Object. Matchmaking can be added later without changing the client protocol.
- Server sends `seed` on join. The current slice uses fixed seed 7; rebuilding the full client city from a per-room seed is future work.

## 2. Tech Stack (lightweight-first)

| Layer | Choice | Why |
|-------|--------|-----|
| 3D | Three.js r1xx, `MeshToonMaterial` + custom outline (inverted hull) | Small, WebGL1 support, instancing, fallback to Canvas 2D top-down if no WebGL |
| Build | Vite + Terser + Brotli, code-split: `core-drive` first, `city-dress` async | Hit NFR-01 <3MB gz, NFR-02 <5s on 3G |
| Physics | Custom arcade kinematic (no cannon/rapier) | <50KB, Tuk-specific drift is easy |
| Net | WebSocket + full JSON snapshots, 15Hz, light client smoothing | Target <20kbps (NFR-04), not yet measured |
| Server | Cloudflare Worker + Durable Objects (SQLite + WebSocket Hibernation) | One isolated authoritative room per object; no server process to operate |
| Audio | WebAudio procedural horns/engine (no mp3) | 0 asset cost |
| UI | DOM + Canvas minimap (no framework) | Smallest payload |

No textures/fonts in MVP: vertex colors + system font + one embedded WOFF2 only if needed.

## 3. Proposed Repo Layout

```
/client/src/
  main.ts        # boot, quality auto-detect, progressive load
  drive/         # US-02: tuk controller, arcade physics, camera
  city/          # US-30/31: roadGraph.ts, gen.ts, dress.ts (instanced)
  render/        # US-32: toon.ts, outline.ts, pools.ts
  net/           # US-20/21: socket.ts, interp.ts
  game/          # US-10/11: passengers.ts, fare.ts, leaderboard.ts
  ui/            # US-50/51/52/53: hud.ts, minimap.ts, tutorial.ts
/server/src/
  room.ts        # platform-neutral room state and hit rules
  genSeed.ts     # seed issuance
  validate.ts    # US-62 anti-cheat
/worker/src/
  index.ts       # Worker routes + one Durable Object per room
  lobby.ts       # named-room allocator + wait queue
/shared/
  types.ts       # Player, Passenger, Fare, Seed
  fare.ts        # shared fare formula
```

## 4. Client — Driving (US-02)

- Kinematic Tuk: `pos, heading, speed`. `speed += (throttle*drag - brake)*dt`, clamp 0-12.5 m/s (~45km/h).
- Steering scales with speed, handbrake cuts grip for drift. No rigidbody lib.
- Collisions: circle vs road-edge + circle-circle (players/traffic). Incidental = push-out only, 1s stun if `impactSpeed > 8m/s` -> tip void (FR-06, FR-13). Intentional cut-off (FR-16) detected separately, server-validated (see §7).
- Hearts: `hearts=3` per run in `Player`. HUD hearts + hit vignette + smoke at 1 heart left. No extra assets: procedural FX.
- Input abstraction: `keyboard | touch joystick | gamepad` -> same `DriveInput {throttle, steer, brake}`.
- Chase cam: lerp follow, FOV 60->70 with speed, shake toggle (NFR-40).

## 5. Procedural City (US-30/31)

Deterministic PRNG: `mulberry32(seed)`.

1. **Road graph:** jittered grid 8x8, block 40-70m + 2 avenues + 1 roundabout. Prune orphans, ensure connectivity via BFS. Store `nodes[], edges[]`.
2. **Routing:** A* on graph for passenger dest validation + traffic. All dests must be reachable (AC #3).
3. **Dressing:** instanced meshes only:
   - `buildings`: BoxGeometry variants, vertex-colored, Sinhala/Tamil/English sign via CanvasTexture atlas (1 draw call).
   - `palms, busStops, lamps`: InstancedMesh, cull >150m, despawn out of view.
   - Landmarks (3-5): Market hall, Temple/dagoba (cylinder+cone), Station, Galle Face green strip.
4. **Budget:** gen <500ms, <150 draw calls, <150k tris visible. LOD: hide interiors, blob shadows only.

Same `seed` => same `roadGraph + landmarks` on all clients (NFR-12).

## 6. Rendering — Cell-Shaded (US-32)

- `MeshToonMaterial` 2-step gradientMap (8px DataTexture) + hemisphere light (fixed day).
- Outline: inverted-hull shell for Tuk + landmarks only (not every building) to save tris.
- Perf guards (US-61): `pixelRatio = min(devicePR, 1.5)`, dynamic 1.0->0.75 if fps<45 for 3s, `Auto/Low/Med/High` in settings.
- Fallback: if no WebGL, Canvas 2D top-down using same `roadGraph`.

## 7. Multiplayer / Netcode (US-20/21/22/23/24 + US-25/26/27)

- Tick 15Hz server, client sends sequenced sampled `input@10Hz`; the Worker validates sequence, elapsed-time distance, acceleration, and heading continuity. It broadcasts full JSON `{tick, players}` snapshots; delta compression remains future work.
- Client renders remote positions with light smoothing and local prediction for self only.
- Claim flow: client `REQUEST_PICKUP passengerId` -> server validates range/seats -> `PICKUP_OK` broadcast. Same for `DROPOFF`. Prevents steal races (FR-12).
- Combat/economy flow (current): client sends `CUT_ATTEMPT`, `PICK`, and `DROP`; the Worker validates movement/combat/fare conditions and broadcasts authoritative `HIT`, `WRECKED`, `PASSENGER`, and cash/delivery updates. The third hit broadcasts `WRECKED`, transfers 20% cash, and puts the victim in a server-owned wrecked state. `RESPAWN` restores hearts/position after a 3s lease and applies an 8s shield.
- Bots and a persistent account/session system are roadmap items. The Worker does implement a 30-second admission-ticket reconnect lease that restores the same room player id/state. Quick Play currently admits the first available human immediately.

Payload target <20kbps/client (NFR-04); current full JSON snapshots still need measurement/optimization.

## 8. Shared Types / Protocol

```ts
type SeedMsg = { seed: number, roomId: string }
type Snapshot = [id:number, x:number, z:number, h:number, v:number, cash:number, hearts:number]
type PickupReq = { t:'pick', pid:string }
type DropoffReq = { t:'drop', pid:string }
type CutAttempt = { t:'cut', victimId:number } // server validates cone/range/speed
type HitEvent = { t:'hit', attackerId:number, victimId:number, heartsLeft:number }
type EliminatedEvent = { t:'wrecked', victimId:number, killerId:number, cashStolen:number }
Fare = base(50) + per_m(2)*dist_m + tip(speedBonus + noCrashBonus) // shared/fare.ts
```

Server is sole authority for `cash, pid ownership, hearts/hits` (US-62, US-27). Client predicts FX only (`+Rs.XXX` on `DROPOFF_OK`, `Cut!` on `HIT`).

## 9. Anti-Cheat / Validation (US-62 + US-27)

- Movement validation currently checks sampled distance, elapsed time, acceleration, turn rate, and speed bounds; it does not yet simulate vehicle controls on the server.
- Combat uses the shared `isCutOff` rule plus server cooldowns, immunity, spawn safety, and alive-state checks.
- Nickname filtering, 30 messages/second per socket, and lobby rate limits are implemented; broader abuse scoring and bot-only rooms are roadmap items.
- Fare calculation, passenger ownership, pickup/drop validation, and delivery/cash settlement are server-owned in the current Worker.

## 10. Observability (NFR-50)

RUM: `time-to-drive, fps p50/p95, payloadBytes, CCU, cash/run`. Server: `tickLag, roomCount`. Alert if `tickLag>80ms` or `driveTime p95>5s`.

## 11. Vertical Slice Next (maps to 05)

1. `client drive + cam` (US-02, US-32) on flat plane
2. `+ roadGraph gen + minimap` (US-30, US-51)
3. `+ 1 passenger pick/drop + fare FX` (US-10, US-11, US-50)
4. Then net rooms + leaderboard (US-20/21/23)

Exit criteria slice: drive 60fps, seeded city identical 2x, pick/drop works offline.
