# Railway deployment

Chorebank can be a two-service Railway template: the app from this repository plus Railway PostgreSQL. The repository's `railway.json` uses the Dockerfile, applies Prisma migrations before deploy, and waits for the database-aware `/api/health` check.

[Deploy the Chorebank template](https://railway.com/deploy/gtF9bg).

Railway template icon: `https://raw.githubusercontent.com/dhalarewich/chorebank/main/public/chorebank-coin.png`

## Template configuration

Create an app service and a PostgreSQL service named `Postgres`. Enable public HTTP networking for the app, then configure these app variables in the template editor:

| Variable | Template value | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Private PostgreSQL connection |
| `DIRECT_URL` | `${{Postgres.DATABASE_URL}}` | Direct connection used by Prisma migrations |
| `AUTH_SECRET` | `${{secret(43)}}` | Signs login sessions; seal this variable |
| `SETUP_TOKEN` | `${{secret(32)}}` | Protects first-run browser setup; leave visible until setup is complete |
| `DEFAULT_HOUSEHOLD_ID` | `home` | Canonical lowercase household slug |
| `TENANCY_MODE` | `single` | Chorebank V1 supports one household per deployment |
| `NODE_ENV` | `production` | Disables development-only behavior |

Do not add the parent password or kid PIN as variables. The owner enters them once at `/setup`; Chorebank stores only password hashes in PostgreSQL.

Railway templates and generated secrets are configured in the Railway template editor, not in `railway.json`. Use reference variables so Railway deploys PostgreSQL before the app. Do not seal `SETUP_TOKEN` in the template: sealed values cannot be viewed, and the owner needs this value for `/setup`. This template was verified in a clean project through setup, both login roles, redeployment, password recovery, and PITR verification.

## Household owner actions

1. Deploy the template and wait for both services to become healthy.
2. Open the app's generated domain. An empty installation redirects to `/setup`.
3. Copy the app service's `SETUP_TOKEN` value, complete setup, and sign in. Setup permanently closes after the first household is created.
4. Seal `SETUP_TOKEN` after setup. Keep `AUTH_SECRET` stable; changing it signs everyone out.
5. Open the Postgres service's **Backups** tab and enable at least daily volume backups. For finer recovery, enable Railway PITR there as well. Run a restore drill before relying on either feature.
6. Keep automatic deploys on a stable release branch and review release notes before upgrades that include database migrations.

## Owner commands

Run maintenance commands inside the deployed app container so they can reach Railway's private PostgreSQL hostname. On first use, Railway asks to register a local SSH key.

```bash
# Open a shell in the app service, then run either command inside it.
railway ssh --service chorebank
npm run pitr:verify
npm run password:reset
```

Do not edit password hashes directly. After a suspected credential compromise, also rotate `AUTH_SECRET` to invalidate every active session.

Railway PostgreSQL is an unmanaged service. The household owner remains responsible for backups, restore tests, costs, updates, and access to the Railway account.

## Sources

- [Create a Railway template](https://docs.railway.com/templates/create)
- [Template variables and generated secrets](https://docs.railway.com/variables/reference)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Volume backups](https://docs.railway.com/volumes/backups)
- [Point-in-time recovery](https://docs.railway.com/volumes/point-in-time-recovery)
