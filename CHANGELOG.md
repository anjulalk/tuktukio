# Changelog

All notable changes to TukTuk.io are documented here. The project uses semantic versioning once the public API and protocol stabilize.

## [Unreleased]

### Added

- Cloudflare Worker deployment for `tuktukio.anjula.dev`.
- SQLite Durable Object room and sharded lobby infrastructure.
- Named-room waitrooms and Quick Play admission.
- Server-authoritative combat, respawn, passenger, pickup/drop, fare, cash, and delivery state.
- Admission tickets, reconnect grace, heartbeat eviction, rate limiting, origin checks, and security headers.
- GitHub Actions CI and Cloudflare deployment workflow.
- AI agent context files, subsystem guides, and task playbooks.

### Changed

- CI and deployment now use current GitHub Action major versions.
- Production deployment is gated on a successful `main` CI run.

### Known gaps

- Persistent accounts and cross-session progression.
- Quick Play bots or an explicit minimum-human/solo policy.
- Full server-side vehicle simulation and collision authority.
- Compact/interest-managed netcode and target-CCU load-test results.
- Per-room seed/world handoff; the current client world uses a fixed seed.

## [0.1.0] — 2026-09-24

- Initial browser game and local Node fallback.
- Procedural city, tuk-tuk driving, passenger loop, HUD, and visual pass.
- Initial Cloudflare Worker and Durable Object multiplayer slice.
