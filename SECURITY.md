# Security policy

## Supported versions

Security fixes are applied to the current `main` branch and the latest 0.1.x release line. Older versions may receive guidance but are not guaranteed patches.

## Reporting a vulnerability

Use a private [GitHub security advisory](https://github.com/dhalarewich/chorebank/security/advisories/new). Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Include the smallest safe reproduction: affected version or commit, prerequisites, steps, impact, and any suggested mitigation. Do **not** include household names, child information, emails, passwords, PINs, session cookies, `AUTH_SECRET`, database URLs, backups, LAN addresses, or unredacted screenshots/logs.

An acknowledgement and next step will be provided after review. Please allow time for investigation and coordinated remediation before public disclosure.

## Scope

Report issues affecting Chorebank source code, Docker Compose configuration, CI workflow, or published dependencies. For a compromised host, PostgreSQL server, router, reverse proxy, or third-party identity provider, secure that system first and include only sanitized context in the advisory.

## Hardening a self-hosted instance

- Generate unique high-entropy `AUTH_SECRET` and `SETUP_TOKEN` values of at least 32 characters (not placeholders) plus a strong PostgreSQL password.
- Keep the host, Docker, Node.js image, and PostgreSQL image patched.
- Expose the service only on networks and through reverse proxies you trust; use HTTPS when it leaves a trusted LAN.
- Back up PostgreSQL regularly and protect backups like household data.
- Do not enable demo mode in production unless you explicitly accept its non-persistent test behavior.
- Use `npm run password:reset` for lost parent access; after suspected compromise, also rotate `AUTH_SECRET` to invalidate active sessions.

See [README.md](README.md) for backup commands and [CHANGELOG.md](CHANGELOG.md) for security-relevant release notes.
