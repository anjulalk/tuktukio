# Architecture Decision Records

This directory records durable technical decisions for TukTuk.io. ADRs are immutable after acceptance; supersede them with a new ADR when a decision changes.

- [`0001-room-authority.md`](0001-room-authority.md) — Worker/Durable Object authority and reconnect model.
- [`0002-cloudflare-hosting.md`](0002-cloudflare-hosting.md) — GitHub source/CI plus Cloudflare runtime.
- [`0003-lobby-sharding.md`](0003-lobby-sharding.md) — Hashed Lobby Durable Object shards.

When an ADR affects code, update the relevant `AGENTS.md`, runbook, tests, and `CHANGELOG.md` in the same change.
