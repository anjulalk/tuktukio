# Shared Agent Guide

`shared/` is the dependency-light contract layer used by the browser, Worker, and Node fallback.

## Rules

- Keep modules platform-neutral: no DOM, Node-only, or Cloudflare-only APIs.
- Keep protocol types precise and discriminated unions where practical.
- Validate untrusted JSON at runtime in each network boundary; TypeScript types alone do not validate the wire.
- Preserve backward compatibility deliberately. A protocol change requires coordinated updates and documentation.
- Pure game rules belong here when both client and server need them; authoritative state transitions belong in the server runtime.

## Files

- `protocol.ts` — client/server wire messages.
- `types.ts` — shared state and event types.
- `cutoff.ts` — pure cut-off rule.
- `fare.ts` — pure fare formula.
- `prng.ts` — deterministic random helper.

## Protocol checklist

Before changing a message:

1. Update the type.
2. Update Worker parsing and handling.
3. Update Node fallback parsing/handling where applicable.
4. Update client runtime parsing and behavior.
5. Add tests for malformed/valid messages.
6. Update multiplayer documentation and changelog.
