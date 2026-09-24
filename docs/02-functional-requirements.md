# TukTuk.io — Functional Requirements

## 2.1 Core Gameplay Loop

- **FR-01 Join & Play:** User can play without signup via `Play` -> auto-assign nickname `Tuk####` + region room in <5s.
- **FR-02 Drive:** Tuk Tuk controls: accelerate/brake/steer, reverse, handbrake, mobile touch joystick + buttons. Max speed ~45 km/h arcade physics.
- **FR-03 Pick Up:** Drive near waiting passenger marker -> auto/manual stop for 1-2s -> passenger boards if seats free (capacity: 1 start, max 3 with upgrades).
- **FR-04 Drop Off:** Drive to passenger destination marker within time limit -> auto cash payout based on distance + tip for speed/safety.
- **FR-05 Fare System:** Fare = `base + per_m * distance + tip(speed, no-crash bonus)`. Show floating `+Rs.XXX` feedback.
- **FR-06 Fail States:** Passenger patience timer expires -> they leave, rating drops. Crash at high speed -> lose tip, brief stun, no hard death in MVP.
- **FR-07 Session End:** Endless until quit, or 5-min Blitz room option. Cash resets per session, best score kept locally (localStorage).

## 2.2 Multiplayer — .io Style

- **FR-10 Rooms:** 12-20 players per room/instance. Auto-matchmaking by latency + auto-refill with bots if <6 humans. Players can also enter a normalized room name: join its open instance, create the first instance, or wait in a queue when it is full. **Quick Play** assigns the player to an open public room, or creates a new public room when public rooms are full.
- **FR-11 Real-time Sync:** See other Tuks, passengers contested first-come-first-serve, position updates at 10-15Hz with client interpolation.
- **FR-12 Steal / Contest:** Any player can pick any free passenger. Destination is private to carrier.
- **FR-13 Collision (baseline):** Soft arcade push + slowdown on incidental contact. Intentional cut-off/attack is governed by FR-16, not by raw collision.
- **FR-16 Cut-Off / Attack:** Player can attack by cutting off another Tuk from the front: overtake into front cone (within 1 Tuk length, heading diff <30°, attacker speed > victim speed) and forcing victim to brake/swerve. Successful cut-off causes victim slowdown (speed cut 50% for 2s + tip void + camera wobble), attacker gets brief boost + `Cut!` FX. Server-validated, 3s cooldown per attacker, 5s immunity per victim after a hit.
- **FR-17 3-Hit Elimination (retention-friendly):** Each Tuk has 3 hearts per run. 3 successful cut-offs received = Wrecked / Game Over for receiver (Tuk smokes, locked 3s, then spectate + Game Over screen with placement). Attacker who lands final blow steals 20% of victim cash + leaderboard kill credit. Hearts reset each run. Retention rule: NO dropping all fares — victim keeps delivered count + 80% cash, aboard passengers stay bound and are restored on instant respawn (Play Again <3s at map edge with 8s revenge shield + pity passenger nearby). No fare wipe to street.
- **FR-18 Anti-Griefing Guards:** No friendly-fire in first 10s after spawn, no hits while victim is stopped at pick/drop zone, teaming detection (same attacker >3 hits on same victim in 60s = temp ghost + no more damage). Eliminated player can Play Again instantly.
- **FR-14 Leaderboard:** Live sidebar Top 5 cash + end-of-run rank. Name, cash, passengers delivered.
- **FR-15 Rejoin:** Disconnect <30s -> rejoin same room with same cash.

## 2.3 World — Procedural Urban Sri Lanka

- **FR-20 Procedural Road Network:** Seeded grid + jitter + main avenues, side lanes, one-ways, roundabouts. Guaranteed connectivity, no orphan roads.
- **FR-21 City Dressing (Procedural/Low-poly):** Stilt houses, shops with Sinhala/Tamil/English signs, dagobas, palm trees, bus stops, markets, railway crossing, beach edge. All from primitives + vertex colors, no textures in MVP.
- **FR-22 Traffic & Pedestrians:** AI ambient buses/cars on lanes + waiting passengers on sidewalks. Simple avoidance, despawn out of view.
- **FR-23 Landmarks:** 3-5 readable landmarks per seed: Pettah Market, Galle Face Green, Temple, Station for navigation.
- **FR-24 Cell-Shaded 3D View:** Third-person chase cam, toon outline + 2-tone lighting, day lighting fixed in MVP.

## 2.4 Economy & Progression (Light)

- **FR-30 Upgrades (in-session):** Spend cash on: Engine L1-3, Extra Seat, Patience Charm. Lost on session end.
- **FR-31 Cosmetics (session only in MVP):** Tuk color, roof pattern, horn sound.
- **FR-32 Rating:** 1-5 star driver rating affects tip multiplier and passenger willingness.

## 2.5 UI/UX

- **FR-40 HUD:** Cash, passengers aboard/destinations with off-screen arrows + distance, minimap, speed, patience bar, leaderboard.
- **FR-41 Onboarding:** 30s interactive tutorial: drive -> pick -> drop. Skippable.
- **FR-42 Minimap:** Canvas 2D top-down roads + player dot + passenger/destination icons. Rotates with player.
- **FR-43 Menus:** Landing (Play, How, Settings), Pause (Resume, Quit, Mute), Game Over (Cash, Delivered, Best, Play Again, Copy Link).
- **FR-44 Settings:** Quality Auto/Low/Med/High, mute, invert camera, touch layout.
