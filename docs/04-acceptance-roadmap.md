# TukTuk.io — Acceptance Criteria & Roadmap

## Acceptance Criteria (MVP)

1. Guest clicks Play on 3G throttled laptop -> driving in <5s, download <5MB.
2. 15-player room, pick 3 passengers and drop for cash with live leaderboard update.
3. Same seed loads identical road graph on 2 clients, all destinations reachable via A*.
4. Low mode holds 30fps on Intel UHD + Moto G class device.
5. Hacker teleporting or spoofing cash is rejected by server.
6. Cut-off from front registers 1 hit with victim slowdown; 3rd hit wrecks victim (Game Over + 20% cash to killer); safe zones/cooldowns/immunity enforced.

## MVP vs Post-MVP

**MVP (P0):** FR-01 to FR-18, FR-20/21/24, FR-40/41/43, all NFR-01 to NFR-06.

**P1:** Traffic, upgrades, blitz timer, bots, rejoin (FR-22, FR-30, FR-15).

**Post-MVP:** Accounts, persistent garage, night/rain, voice, tournaments, ads/cosmetic shop.

## Suggested Build Order

1. Drive + procedural road + cell-shaded render
2. Passengers + fare + HUD/minimap
3. Multiplayer rooms + leaderboard + cut-off combat + server authority
4. Perf pass: <3MB, 60fps, dynamic resolution
5. Tutorial + menus + bots + hardening
