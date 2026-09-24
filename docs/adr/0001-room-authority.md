# ADR 0001: Keep Room Authority in Durable Objects

- Status: Accepted
- Date: 2026-09-24

## Context

The game has real-time multiplayer state, combat, passenger ownership, fares, and reconnect behavior. A browser client alone cannot safely coordinate simultaneous players or enforce economy rules.

## Decision

Use one `TukTukRoom` Durable Object per room ID. The Worker validates admission and routes the WebSocket; the Room DO owns authoritative state and events. The browser predicts local driving and renders state only.

A short-lived admission ticket is required before a socket is accepted. A disconnected player receives a 30-second grace lease so the same player ID and state can be restored.

## Consequences

- Different rooms scale independently.
- Room actions are serialized and server-authoritative.
- The Worker remains a small routing/security boundary.
- Active rooms currently use a 15Hz interval and need cost/load measurement.
- Reconnect is bounded to a grace window, not a persistent account system.

## Alternatives considered

- Node WebSocket server: rejected for the primary runtime because it requires separate operations and scaling.
- Client-authoritative economy: rejected because it permits race and cash exploits.
- One global room object: rejected because unrelated rooms would contend.
