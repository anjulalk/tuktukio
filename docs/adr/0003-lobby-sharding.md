# ADR 0003: Shard Lobby Allocation by Room or Region

- Status: Accepted
- Date: 2026-09-24

## Context

A single global Lobby Durable Object would serialize every named-room and Quick Play admission. That creates a hot object and an increasingly large state blob as the game grows.

## Decision

Use eight hashed Lobby Durable Object shards. Named rooms hash their normalized name to a stable `n0`–`n7` shard. Quick Play hashes the Cloudflare edge region to a `q0`–`q7` shard. Room IDs carry their shard prefix so the Room DO can route ticket operations back to the correct Lobby DO.

Each shard maintains bounded rooms, queues, reservations, and idle cleanup.

## Consequences

- Named-room state is distributed deterministically.
- Quick Play keeps nearby players more likely to share a shard.
- The protocol carries a `lobbyId` for polling/reconnect.
- Shard health/load still needs measurement and may need further regional routing.

## Alternatives considered

- One global Lobby DO: simpler but a scalability bottleneck.
- Random room allocation: breaks stable named-room lookup and reconnect routing.
