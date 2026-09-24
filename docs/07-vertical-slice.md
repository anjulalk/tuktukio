# TukTuk.io — Vertical Slice 1 (07)

> Offline slice: drive + seeded city + toon cam + pick/drop. TS strict throughout.

## TS policy (user requirement)
- `strict: true` + `noUncheckedIndexedAccess` + `noFallthroughCasesInSwitch` in `tsconfig.json`.
- No `any`. Explicit return types on shared pure funcs.
- Similar techniques throughout: pure logic lives in `/shared` (`fare.ts`, `prng.ts`, `cutoff.ts`, `types.ts`) and is reused by `client/` (predict) and `server/` (validate).
- `npm run typecheck` (`tsc --noEmit`) must pass before `vite build`.

## What runs
- `npm run dev` → WASD/arrows drive (screen-space: D/Right = screen-right), SPACE cut-off, stop on GREEN to pick (max 3), GOLD to drop, `+Rs.` payout, rotating player-centered minimap (FR-42), HUD `Rs. · ☆ · ♥♥♥`.
- Steering fix: `heading -= steer` because chase cam looking +forward makes +heading = screen-left.
- Minimap fix: robust canvas lookup + bearing-relative transform `rel=bearing-heading`, 120m range, edge arrows for off-range dests.
- Deterministic: `buildRoadGraph(7)` identical every load (NFR-12).
- Perf: pixelRatio capped 1.5, instanced buildings, toon gradientMap (NFR-03/06). Build: 476KB JS / 121KB gzip — well under <3MB (NFR-01).

## Combat stub (FR-16/17, retention)
- `shared/cutoff.ts:isCutOff()` is the single rule (front cone <4m, <30°, attacker faster).
- `server/src/validate.ts:validateCut()` + `room.ts:applyHit()` enforce cooldowns/safe zones, 20% steal, hearts. Retention: fares stay bound, no wipe.
- Offline HUD shows ♥♥♥, no damage yet. Full ws room + bots next.

## Next
1. ws room at 15Hz + snapshots with hearts (US-20/21/25/26)
2. Kill-feed + wreck/respawn with shield + pity passenger (US-26/27)
3. Touch controls + tutorial (US-52)

## Updates
- Reverse: S brakes then reverses to -4.5 m/s; screen-relative steering both gears; gear badge D/N/R in speedo (`drive/tuk.ts:gearOf`).
- Minimap: circular (CSS 50% + canvas clip), same graph segments as instanced 3D roads, player-up rotation, red N north hint (-Z).
- 3D roads now instanced per-edge segments matching the graph exactly.
