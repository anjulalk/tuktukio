# ADR 0002: GitHub Source with Cloudflare Runtime

- Status: Accepted
- Date: 2026-09-24

## Context

The repository needs versioned source, public documentation, CI, and automated deployment. The realtime runtime needs WebSockets, Durable Objects, rate limiting, and custom-domain routing.

## Decision

GitHub owns the source, issues, CI, and deployment workflow. Cloudflare Workers owns the deployed frontend assets, API, WebSockets, and Durable Objects. The production custom domain is `tuktukio.anjula.dev`.

GitHub Pages is not the game host because it cannot execute the Worker or Durable Objects.

## Consequences

- `main` can deploy automatically after CI succeeds.
- Cloudflare credentials stay in GitHub Actions secrets.
- The Worker can serve the client and API from one origin.
- A separate frontend would require an API subdomain and explicit CORS configuration.

## Alternatives considered

- GitHub Pages for the full game: rejected because WebSockets and Durable Objects are unavailable.
- Manual-only deployment: rejected because it is less reproducible.
