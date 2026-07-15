# Release notes

## 0.1.0 — 2026-07-15

Chorebank V1 is the first self-hosted release. It includes a tablet-friendly chore board, parent award/payday/redemption tools, household settings, a kid reward store, protected browser onboarding, parent-password recovery, PostgreSQL persistence, Docker Compose deployment, and Railway deployment configuration.

Before upgrading or deploying, back up PostgreSQL. Use the commands in [README.md](README.md). This release supports Docker Compose plus PostgreSQL; SQLite, offline sync/PWA, and native tablet apps are not included.

## Upgrade notes

1. Back up PostgreSQL.
2. Pull the desired release tag or commit.
3. Run `docker compose up --build -d`.
4. Confirm `docker compose ps` is healthy and open the app.

See [CHANGELOG.md](CHANGELOG.md) for the ongoing change record and [SECURITY.md](SECURITY.md) for vulnerability reporting.
