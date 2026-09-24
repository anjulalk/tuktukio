# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories:

<https://github.com/anjulalk/tuktukio/security/advisories/new>

Do not open a public issue for an exploitable vulnerability, credential exposure, or user-data problem. Do not include live tokens, admission tickets, private room data, or personal information in a report.

## What to include

- Affected endpoint, file, or feature.
- Reproduction steps and impact.
- Whether the issue is already public.
- Any suggested mitigation.
- A safe contact method through the advisory.

## Secret handling

- Cloudflare API tokens belong only in GitHub Actions secrets or a local secret store.
- Never place credentials in `wrangler.jsonc`, `.env`, `.env.local`, `.dev.vars`, source, logs, screenshots, issues, or pull requests.
- If a token is pasted into chat, logs, a commit, or a public issue, revoke it immediately and create a replacement.
- Admission tickets are bearer credentials. Do not publish them or include them in URLs shared outside a private test.

## Supported versions

The `main` branch receives security fixes. The currently deployed Worker is the production target until a new release is announced.

## Response

Reports are triaged for severity, reproducibility, and user impact. Please allow a reasonable period for a fix and coordinated disclosure before public disclosure.
