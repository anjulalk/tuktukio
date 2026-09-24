# TukTuk.io — Environment Pass (09)

> Reusable asset kit + living streets. All procedural, still zero downloads.

## Asset kit (`client/src/env/assets.ts`)
- `buildSky`: gradient dome (sunrise EAST so minimap north stays true) + sun disc east-north + batched low-poly cloud puffs. 1 texture, a few draw calls.
- `buildGround`: grass + Galle Face sea/sand strip on the SOUTH edge.
- `buildRoads`: asphalt instanced segments + cream centre dashes (instanced quads every 6m) + raised grey pavements both sides. Same graph the minimap draws.
- `buildBuildings`: 4 canvas-facade types (Pettah shop, house, office, temple hall) with windows + doors, plus batched roof caps, awnings, and contact shadows.
- `buildBarriers`: striped perimeter walls every 8m + tiered dagoba landmark north of spawn. Returns clamped `Bounds`; Tuk position clamps + 0.5x speed thud.
- `buildStreetDetails`: instanced street trees, lamps, and warm road reflectors along the pavement edges.

## People (`client/src/env/people.ts`)
- 2 InstancedMeshes (capsule bodies with shirt colors, sphere heads with skin tones), 24 slots.
- 2 waiters per pickup spot (bob idle), walk to Tuk door on `onPickup` then hide.
- `onDrop` spawns 2 walkers from the Tuk that stroll 9m away and hide.
- 6 wanderers loop pavement waypoints at ~1.2 m/s.
- `setWaiting()` re-syncs after every fare respawn.

## Cost
Build 525KB JS / 137KB gzip — still far under <3MB NFR-01. New street details are instanced; the scene adds a small fixed number of draw calls rather than per-object meshes.
