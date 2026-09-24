# TukTuk.io — Vision & Scope

> Durable context file. Source of truth for what TukTuk.io is.

## Vision
TukTuk.io is a dot.io style multiplayer Tuk Tuk game where you pick and drop people to earn cash. Procedurally generated road network based in urban Sri Lanka, shown in a cell-shaded 3D view. Designed to be performant, lightweight and extremely low amount of assets to download since it is designed as a browser game.

## Design Pillars
1. **Instant play** — no install, <5s to in-game.
2. **Lightweight** — extremely low download, runs on low-end laptops / mobile browsers.
3. **Competitive casual loop** — 3-5 min sessions, pick/drop/earn/outscore.

## Scope

### In Scope (MVP)
- Browser 3D client (WebGL)
- Procedural city + road network
- Multiplayer rooms (12-20 players)
- Pick/drop economy + cash leaderboard
- Guest play, no signup required

### Out of Scope (MVP)
- Accounts / persistent progression
- Monetization / ads / IAP
- Native mobile apps
- Voice chat
- User-generated maps

## Personas
- **Casual Browser Player:** 30s attention span, guest play.
- **Grinder:** Wants high score, rank, cosmetics.
- **Low-end Device Player:** 4GB RAM, integrated GPU, 3G connection.

## Game Pillars Mapping
- `.io` loop -> `docs/02-functional-requirements.md` FR-01 to FR-15
- Procedural Sri Lanka city + cell-shaded 3D -> FR-20 to FR-24
- Lightweight browser -> `docs/03-non-functional-requirements.md` NFR-01 to NFR-06
