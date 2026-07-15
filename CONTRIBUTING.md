# Contributing

Thanks for helping improve Chorebank. Keep changes focused, test the affected flow, and do not include real household data anywhere in the repository.

## Local setup

Use Node.js 22+ and PostgreSQL, or use Docker Compose for the supported self-hosted path.

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run dev
```

For a local household, set the required environment values and run `npm run setup` against an empty database. For UI work without persistence, use `/?mode=demo` in development.

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm run test:e2e` when changing a user flow, route, responsive layout, or demo behavior. Add or update focused tests for non-trivial behavior changes.

## Privacy and security

- Use generic demo names and fake values only.
- Remove names, emails, passwords, PINs, IP addresses, database URLs, logs, and identifying screenshots from commits and issues.
- Report vulnerabilities through a private GitHub security advisory, not a public issue. See [SECURITY.md](SECURITY.md).

## Change scope

Keep the Docker Compose + PostgreSQL path working. Avoid adding dependencies or infrastructure unless the change needs them. Update user-facing docs and `CHANGELOG.md` when behavior, setup, security posture, or support claims change.
