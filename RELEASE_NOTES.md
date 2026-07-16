# Release notes

## 1.0.0 — 2026-07-16

Chorebank V1 is the first stable self-hosted release. It includes a tablet-friendly chore board, parent award/payday/redemption tools, household settings, a kid reward store, protected browser onboarding, parent-password recovery, PostgreSQL persistence, Docker Compose deployment, and Railway deployment configuration.

Payday now culminates in the Coin Foundry: coins fall through a dimensional chute, collide into a deterministic stack, and land with a short sequence of optional clinks. The sequence is responsive, replay-safe, bounded for large balances, and settles immediately when reduced motion or app animations are disabled.

V1 also tightens production secret validation, improves setup guidance and automatic timezone selection, fills accessibility gaps in parent navigation and reward confirmation, and verifies the core household loop against live PostgreSQL in CI.

Before upgrading or deploying, back up PostgreSQL. Use the commands in [README.md](README.md). This release supports Docker Compose plus PostgreSQL; SQLite, offline sync/PWA, and native tablet apps are not included.

## Upgrade notes

1. Back up PostgreSQL.
2. Pull the desired release tag or commit.
3. Run `docker compose up --build -d`.
4. Confirm `docker compose ps` is healthy and open the app.

See [CHANGELOG.md](CHANGELOG.md) for the ongoing change record and [SECURITY.md](SECURITY.md) for vulnerability reporting.
