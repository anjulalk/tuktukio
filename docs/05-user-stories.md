# TukTuk.io — User Stories

> Expands `02-functional-requirements.md` + `03-non-functional-requirements.md` into testable stories.
> Format: `As a <persona>, I want <goal>, So that <value>.`
> Priority: P0 = MVP blocker, P1 = MVP should, P2 = post-MVP.

## Epic A — Instant Play & Driving

### US-01 Guest instant join — P0 — FR-01
**As a** Casual Browser Player, **I want** to click Play and drive without signup, **So that** I start in <5s.
**AC:**
- Given landing page, When I click Play, Then I spawn in a room with auto-name `Tuk####` in <5s on broadband.
- Given no account, When I reload, Then best score persists locally.
- Trace: FR-01, NFR-02.

### US-02 Arcade Tuk driving — P0 — FR-02
**As a** player, **I want** arcade Tuk controls with drift/handbrake, **So that** driving is fun but easy.
**AC:**
- Given spawned, When I use WASD/arrows, Then Tuk accelerates/brakes/steers/reverses, max ~45 km/h.
- Given mobile, When touch controls shown, Then left joystick steers + right buttons gas/brake/horn.
- Given high-speed crash, When collision, Then tip lost + 1s stun, no death.
- Trace: FR-02, FR-06.

### US-03 Blitz / endless session — P1 — FR-07
**As a** Grinder, **I want** 5-min Blitz or endless mode, **So that** I can compete in short bursts.
**AC:**
- Given Blitz room, When timer hits 0, Then Game Over shows rank + cash + Play Again.
- Given endless, When I quit, Then cash resets next run.
- Trace: FR-07.

## Epic B — Pick / Drop Economy

### US-10 Pick up passenger — P0 — FR-03
**As a** player, **I want** to stop near a waiting passenger to board them, **So that** I start a fare.
**AC:**
- Given free seat + passenger marker in range, When I stop 1-2s, Then passenger boards, seat count -1, marker cleared.
- Given full Tuk, When I stop, Then show `Full!` hint, no boarding.
- Trace: FR-03.

### US-11 Drop off + fare payout — P0 — FR-04, FR-05
**As a** player, **I want** clear destination + instant cash payout, **So that** loop is rewarding.
**AC:**
- Given passenger aboard, When destination arrow + distance shown, Then off-screen indicator always visible.
- Given arrival in zone, When stopped, Then payout `base + per_m*distance + tip` with floating `+Rs.XXX`.
- Trace: FR-04, FR-05, FR-40.

### US-12 Patience + rating — P0 — FR-06, FR-32
**As a** player, **I want** patience timer + star rating to matter, **So that** slow/reckless driving is punished.
**AC:**
- Given waiting passenger, When patience expires, Then they leave + my rating -0.5.
- Given 5-star vs 2-star, When fare completes, Then tip multiplier higher for 5-star.
- Trace: FR-06, FR-32.

### US-13 Multi-passenger capacity — P1 — FR-03, FR-30
**As a** Grinder, **I want** to carry up to 3 passengers with separate destinations, **So that** I can chain fares.
**AC:**
- Given Extra Seat upgrade, When 2-3 aboard, Then HUD shows 2-3 destination markers with colors.
- Trace: FR-03, FR-30.

## Epic C — Multiplayer .io

### US-20 12-20 player rooms — P0 — FR-10
**As a** player, **I want** auto-matchmaking into full-feeling rooms, **So that** world feels alive.
**AC:**
- Given <6 humans, When room starts, Then fill with bots to 12 total.
- Given high ping region, When matchmaking, Then join lowest-latency room.
- Trace: FR-10, NFR-04.

### US-21 See rivals + contest fares — P0 — FR-11, FR-12
**As a** player, **I want** to see rivals and race for passengers, **So that** competition is real.
**AC:**
- Given other player position, When network 10-15Hz, Then remote Tuk interpolates smoothly, <150ms delay feel.
- Given free passenger, When two players arrive, Then first stopped claims it, other sees `Taken`.
- Trace: FR-11, FR-12.

### US-22 Soft collision (incidental) — P0 — FR-13
**As a** player, **I want** incidental bumps to not damage me, **So that** only intentional cut-offs count.
**AC:**
- Given side/rear contact without front-cone cut-off conditions, When collision, Then push + slowdown only, no hearts lost.
- Trace: FR-13.

### US-23 Live leaderboard — P0 — FR-14
**As a** Grinder, **I want** live Top 5 + final rank, **So that** I chase leaders.
**AC:**
- Given fare completes, When cash changes, Then sidebar updates in <1s for all.
- Given game over, When rank shown, Then display cash, delivered count, best.
- Trace: FR-14.

### US-24 Rejoin after drop — P1 — FR-15
**As a** player, **I want** to rejoin same room after disconnect, **So that** I don't lose progress.
**AC:**
- Given disconnect <30s, When reconnect, Then same cash + Tuk restored.
- Trace: FR-15, NFR-11.

### US-25 Cut-off attack from front — P0 — FR-16
**As a** competitive player, **I want** to cut off a rival Tuk from the front to slow them, **So that** I can steal fares / defend lead.
**AC:**
- Given I am ahead in victim front cone (<1 Tuk length, heading diff <30°, my speed > victim speed), When I hold position 0.5s, Then server registers 1 hit: victim speed -50% for 2s + tip void + wobble, I get boost + `Cut!` FX.
- Given cooldown active (3s attacker / 5s victim immunity), When I attempt cut-off, Then no hit, show `Immune` shield.
- Given victim stopped in pick/drop zone or spawn <10s, When I attempt, Then no hit (safe zone).
- Trace: FR-16, FR-18.

### US-26 3-hit elimination / Game Over — P0 — FR-17
**As a** player, **I want** 3 successful attacks to wreck a rival, **So that** combat has stakes.
**AC:**
- Given victim has 0/1/2 hearts lost shown in HUD, When 3rd validated hit lands, Then victim = Wrecked: locked 3s + smoke FX + spectate + Game Over (placement, cash kept, kills).
- Given final blow, When elimination occurs, Then attacker steals 20% victim cash + +1 kill on leaderboard + kill-feed entry.
- Given wreck (retention), When victim wrecks, Then NO fare wipe: delivered count kept, 80% cash kept, aboard passengers stay bound and restore on respawn.
- Given eliminated, When I click Play Again, Then fresh 3 hearts + respawn at edge in <3s with 8s shield + nearby pity passenger.
- Trace: FR-17, FR-14.

### US-27 Anti-griefing / fairness — P0 — FR-18
**As a** victim, **I want** teaming/spawn-camping blocked, **So that** fights stay fair.
**AC:**
- Given same attacker hits same victim 3x in 60s with no other action, When detected, Then attacker ghosted (no collision/damage) for 10s.
- Trace: FR-18, NFR-30, NFR-31.

## Epic D — Procedural Urban Sri Lanka + Cell-Shaded 3D

### US-30 Seeded road network — P0 — FR-20, NFR-12
**As a** player, **I want** a new but navigable city each room, **So that** every run feels fresh.
**AC:**
- Given server seed, When 2 clients generate, Then identical road graph in <500ms.
- Given any passenger/destination, When pathfinding, Then A* route exists, no orphans.
- Trace: FR-20, NFR-12.

### US-31 Low-poly Sri Lanka dressing — P0 — FR-21, FR-23
**As a** player, **I want** readable shops, temples, palms, bus stops, **So that** I orient + feel place.
**AC:**
- Given spawn, When looking around, Then 3-5 landmarks visible (Market, Temple, Station, Galle Face).
- Given buildings, When rendered, Then primitives + vertex colors only, 0 textures MVP.
- Trace: FR-21, FR-23.

### US-32 Cell-shaded chase cam — P0 — FR-24
**As a** player, **I want** toon Tuk + smooth chase camera, **So that** game is charming + readable.
**AC:**
- Given drive, When camera follows, Then no clipping through buildings, FOV kick at speed.
- Given day scene, When rendered, Then 2-tone toon + outline, fixed daylight MVP.
- Trace: FR-24.

### US-33 Ambient traffic — P1 — FR-22
**As a** player, **I want** buses/cars + pedestrians, **So that** streets feel alive.
**AC:**
- Given road ahead, When traffic spawns, Then follows lanes, despawns out of view, simple avoidance.
- Trace: FR-22.

## Epic E — Progression (Light)

### US-40 In-session upgrades — P1 — FR-30
**As a** Grinder, **I want** to spend cash on Engine/Seat/Charm mid-run, **So that** strategy matters.
**AC:**
- Given Rs.500+, When I buy Engine L1, Then top speed +10%.
- Given purchase, When session ends, Then upgrades reset.
- Trace: FR-30.

### US-41 Session cosmetics — P2 — FR-31
**As a** player, **I want** Tuk color/roof/horn choice, **So that** I stand out.
**AC:**
- Given menu, When color picked, Then visible to all in room.
- Trace: FR-31.

## Epic F — UI / HUD / Onboarding

### US-50 Game HUD — P0 — FR-40
**As a** player, **I want** cash, arrows, patience, leaderboard always visible, **So that** I never get lost.
**AC:**
- Given fare active, When destination off-screen, Then arrow edge + `120m` shown.
- Trace: FR-40.

### US-51 Minimap — P0 — FR-42
**As a** player, **I want** 2D minimap with roads + icons, **So that** I shortcut.
**AC:**
- Given moving, When minimap updates, Then player-centered, rotates, shows passenger (green) / dest (gold).
- Trace: FR-42, NFR-03 (canvas, no extra draw calls).

### US-52 30s tutorial — P0 — FR-41
**As a** new player, **I want** drive->pick->drop tutorial skippable, **So that** I learn in one run.
**AC:**
- Given first play, When tutorial starts, Then 3 steps with highlights, Skip button.
- Trace: FR-41.

### US-53 Menus + settings — P0 — FR-43, FR-44
**As a** Low-end Device Player, **I want** Landing/Pause/GameOver + quality setting, **So that** I can play smoothly.
**AC:**
- Given Pause, When Quality=Low, Then pixelRatio 1.0, shadows off, fps+15.
- Given GameOver, When Play Again clicked, Then new room in <3s.
- Trace: FR-43, FR-44, NFR-03.

## Epic G — Performance / Tech (NFR stories)

### US-60 <3MB payload — P0 — NFR-01, NFR-02
**As a** 3G player, **I want** playable <3MB gzipped, <5s to drive, **So that** I don't bounce.
**AC:**
- Given clean cache + 3G Fast, When loading, Then drive in <5s, Lighthouse perf >85.
- Trace: NFR-01, NFR-02, NFR-50 RUM.

### US-61 60/30fps + dynamic resolution — P0 — NFR-03, NFR-05, NFR-06
**As a** Low-end Device Player, **I want** auto quality scaling, **So that** game stays smooth.
**AC:**
- Given fps<45 for 3s, When auto mode, Then resolution drops to 0.75x, pixelRatio capped 1.5.
- Given Low mode Intel UHD, When 15 Tuks visible, Then >=30fps, <150 draw calls, <150k tris.
- Trace: NFR-03, NFR-05, NFR-06.

### US-62 Server authority anti-cheat — P0 — NFR-30, NFR-31
**As a** honest player, **I want** cheaters blocked, **So that** leaderboard is fair.
**AC:**
- Given spoofed cash/teleport packet, When server validates, Then reject + log, kick on repeat.
- Given slur nickname, When filter, Then blocked/replaced.
- Trace: NFR-30, NFR-31.

### US-63 Compatibility + a11y — P1 — NFR-20/21/22, NFR-40/41
**As a** mobile/Safari player, **I want** touch + colorblind-safe markers, **So that** I can play anywhere.
**AC:**
- Given 360x640 viewport, When HUD shown, Then no overlap, touch targets >=44px.
- Given colorblind mode, When markers shown, Then shape + color (circle passenger, star dest) + reduced shake option.
- Trace: NFR-20, NFR-21, NFR-40.

## Traceability Matrix

| Epic | US | FR | NFR | Priority |
|------|----|----|-----|----------|
| A | US-01..03 | FR-01,02,07 | NFR-02 | P0/P1 |
| B | US-10..13 | FR-03,04,05,06 | — | P0/P1 |
| C | US-20..27 | FR-10..18 | NFR-04,11 | P0/P1 |
| D | US-30..33 | FR-20..24 | NFR-12 | P0/P1 |
| E | US-40,41 | FR-30,31,32 | — | P1/P2 |
| F | US-50..53 | FR-40..44 | NFR-03 | P0 |
| G | US-60..63 | — | NFR-01,03,05,06,20,30,40,50 | P0/P1 |

## MVP Slice (Build Order)

1. US-02, US-30, US-32 (drive + city + cam)
2. US-10, US-11, US-50, US-51 (fare loop + HUD)
3. US-01, US-20, US-21, US-23 + US-25, US-26 combat (rooms + leaderboard + cut-off/3-hit)
4. US-60, US-61, US-62 + US-27 (perf + anti-cheat + anti-grief)
5. US-52, US-53, US-12 (tutorial + polish)
