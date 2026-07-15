# Repository guide

## Project shape

- `src/app`: Next.js routes and API handlers.
- `src/components/chore-board/ChoreBoardApp.tsx`: primary interactive client UI.
- `src/lib/server/domain`: server-side business logic.
- `prisma`: schema and migrations.
- `tests`: unit, integration, and end-to-end checks.

## Working rules

- Read the full affected flow and its callers before editing. Put a shared fix at the shared layer.
- Reuse existing primitives and avoid new dependencies unless necessary.
- Preserve the Docker Compose + PostgreSQL path. Do not claim SQLite, offline PWA, or native Android support.
- Treat household data as sensitive. Use only generic demo values in docs, screenshots, fixtures, logs, and commits.
- Do not reset databases, push, merge, publish, or change GitHub metadata without explicit authorization.

## Verification

Run the smallest relevant check first. For broad changes, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm run test:e2e` after user-flow, route, responsive, or demo-mode changes. Update `README.md`, `CHANGELOG.md`, `SECURITY.md`, and `llms.txt` when their claims change.
