# TukTuk.io — Non-Functional Requirements

Durable performance budget: performant, lightweight, extremely low assets. Browser-first.

> These are target budgets, not measured production guarantees. Current build is approximately 532 KB JavaScript / 139 KB gzip; the Worker still needs CCU/load testing, and compact netcode, persistent accounts, and full RUM remain launch work.

## 3.1 Performance & Lightweight — Critical

- **NFR-01 Download:** Initial playable payload **<3MB gzipped** (<5MB hard limit). No video, max 1 font, procedural audio.
- **NFR-02 Load Time:** Time-to-drive **<5s on 3G Fast (1.6Mbps)**, <2s on broadband. Progressive load: drive first, dress city async.
- **NFR-03 FPS:** 60fps target on 2020 integrated GPU (Intel UHD), 30fps minimum on low-end Android Chrome at Low quality. Draw calls <150, tris <150k visible.
- **NFR-04 Network:** Client <20kbps up/down, server tick 15Hz, interpolation delay <150ms. Playable at 200ms RTT, 2% loss.
- **NFR-05 Memory:** Tab <350MB desktop, <250MB mobile. No per-frame allocations in hot loop.
- **NFR-06 Battery/Heat:** Cap pixelRatio at 1.5, dynamic resolution scaling if fps <45 for 3s.

> Implementation notes: Three.js/Babylon with custom toon shader or `MeshToonMaterial`, instanced meshes for buildings/trees/people, pooled passengers, no shadows or single 1024px blob shadows, WebGL1 fallback to top-down 2D.

## 3.2 Scalability & Reliability

- **NFR-10 Concurrency:** Room-isolated authoritative servers, autoscale 0-N, 1000 CCU MVP target, 10k architecture-ready. MVP uses one Cloudflare Durable Object per room plus a serialized lobby allocator; matchmaking/region routing can be added at the Worker edge.
- **NFR-11 Availability:** 99.5% MVP, rooms crash -> players re-queued, no data loss beyond current run.
- **NFR-12 Deterministic Gen:** Same seed = same city on all clients. Seed from server, generation <500ms.

## 3.3 Compatibility

- **NFR-20 Browsers:** Evergreen Chrome/Edge/Firefox/Safari last 2 versions. Mobile Chrome/Safari touch playable.
- **NFR-21 Input:** Keyboard WASD/arrows, touch, basic gamepad. 360x640 min viewport.
- **NFR-22 No Install:** Pure WebGL + WebSocket, no WebGPU/extensions required.

## 3.4 Security & Anti-cheat

- **NFR-30 Authority:** Server authoritative for cash, pick/drop validation, position sanity check (speed/teleport). Client is render + prediction only.
- **NFR-31 Abuse:** Rate-limit rooms, nickname filter + Sinhala/English profanity, mute/report, simple speed-hack detection -> kick to bot room.

## 3.5 Accessibility & Localization

- **NFR-40:** Colorblind-safe markers (shape + color), subtitles for horns, reduced camera shake toggle.
- **NFR-41:** English MVP, i18n-ready for Sinhala/Tamil.

## 3.6 Observability

- **NFR-50:** Track: join->drive time, fps p50/p95, payload size, CCU, retention D1, avg cash/run, crash rate. RUM + server tick lag alerts.
