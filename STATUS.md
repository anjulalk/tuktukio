# TukTuk.io Release Status

> [!WARNING]
> **Status: ALPHA — NOT PRODUCTION-READY.**
> This repository contains known bugs and unfinished launch work. Use it for testing and feedback, not for a competitive, paid, or high-stakes public launch.

## Current release

- Version: `0.1.0-alpha.1`
- Live preview: <https://tuktukio.anjula.dev>
- Source: <https://github.com/anjulalk/tuktukio>
- Hosting: Cloudflare Workers + Durable Objects
- Source/CI: GitHub

## What works today

- Browser driving and passenger delivery loop.
- Named rooms and bounded waitrooms.
- Quick Play admission to public rooms.
- Ticket-gated Cloudflare WebSockets.
- Server-authoritative passenger ownership, fares, cash, deliveries, combat, and respawns.
- Short reconnect grace for dropped sessions.
- Local Node fallback for development.
- CI, CodeQL, and Cloudflare deployment workflows.

## Known issues and unfinished work

- Quick Play has no bots or minimum-human policy; a player may be alone.
- The client world currently uses a fixed seed instead of rebuilding from the room seed.
- Movement uses validated sampled positions, not a complete server-side vehicle/collision simulation.
- There is no persistent account, progression, or durable cross-session profile system.
- Snapshots are full JSON; compact delta/interest-managed netcode is not implemented.
- Target-CCU load tests, soak tests, and production cost validation are not complete.
- Some reconnect, mobile, browser-background, and edge-network cases remain untested.
- The local Node fallback is not equivalent to the production Worker and is for development only.

## Alpha-to-beta gates

Do not call this beta until all of the following are true:

- Known gameplay and reconnect bugs are fixed or explicitly accepted.
- Quick Play has a defined solo/bot/minimum-player policy.
- Server movement/collision behavior is sufficiently authoritative.
- Per-room seed/world handoff is implemented and tested.
- Multi-client integration tests cover rooms, fares, combat, reconnect, and persistence.
- Load/soak tests establish a target CCU and cost envelope.
- A persistent identity/session strategy is documented.
- Security review and abuse testing are complete.

## Reporting bugs

Use the repository issue templates for reproducible bugs:

<https://github.com/anjulalk/tuktukio/issues/new/choose>

Do not report vulnerabilities publicly. Follow [SECURITY.md](SECURITY.md).

When reporting a bug, include the browser, OS, whether you used Cloudflare or the Node fallback, reproduction steps, and redacted logs. Never include API tokens or admission tickets.
