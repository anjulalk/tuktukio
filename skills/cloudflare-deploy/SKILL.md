# Cloudflare Deployment Skill

Use this skill for Worker routes, Durable Objects, custom domains, CI/CD, migrations, or production incidents.

## Start here

- `AGENTS.md`
- `worker/AGENTS.md`
- `docs/10-production.md`
- `wrangler.jsonc`
- `.github/workflows/deploy.yml`

## Safe deployment flow

```bash
npm ci
npm test
npm run worker:check
npx wrangler whoami
npm run worker:deploy
```

After deployment:

```bash
curl https://tuktukio.anjula.dev/api/health
curl https://tuktukio.anjula.dev/api/ready
```

Then open <https://tuktukio.anjula.dev> and test a named room, Quick Play, and a second client.

## GitHub Actions

Required repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Never print a token. If a token is exposed, revoke it before creating a replacement. Set secrets with `gh secret set` or the GitHub UI, not in the repository.

## Durable Object rules

- Add a migration tag for lifecycle/schema changes.
- Keep restore logic tolerant of old values.
- Prefer namespaced storage keys and explicit deletes.
- Keep lobby shards and room IDs deterministic enough for routing.
- Check rate-limit namespace collisions before deploying.

## Incident checklist

1. Check the GitHub Actions run and Workers Logs.
2. Check `/api/health` and `/api/ready`.
3. Identify whether the failure is edge routing, a Lobby shard, a Room DO, or a client protocol mismatch.
4. Roll back using the last known-good Wrangler deployment if necessary.
5. Do not delete Durable Object storage casually; it may contain active rooms and reconnect state.
