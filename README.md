# Chorebank

Chorebank is a private, self-hosted family chore and rewards board built with Next.js, Prisma, and PostgreSQL.

## Recommended: Docker Compose

Use this on a home server, NAS, or small computer with Docker Compose installed.

1. Clone the repository and enter it.
2. Create your ignored local environment file:

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

3. Generate a second random value. Put the two values in `AUTH_SECRET` and `SETUP_TOKEN`, choose a long `POSTGRES_PASSWORD`, and choose a lowercase `DEFAULT_HOUSEHOLD_ID` slug in `.env`.
4. Start Chorebank:

```bash
docker compose up --build -d
docker compose ps
```

5. Visit `http://SERVER_LAN_IP:3000`. An empty installation opens `/setup`. Enter `SETUP_TOKEN` from `.env`, then create the household, parent login, kid PIN, and first child. The browser uses `DEFAULT_HOUSEHOLD_ID` as the canonical slug, refuses mismatches, and permanently disables setup after success.

The equivalent terminal wizard remains available as `docker compose exec app npm run setup`. It refuses to run if household data exists and never resets or overwrites data.

Android tablets work as normal browser clients. Open that LAN address in Chrome and use **Add to Home screen** if desired. Chorebank does not provide offline operation or native Android packaging.

### Daily operations

```bash
# Stop without deleting data
docker compose down

# Update to the latest checked-out release
git pull
docker compose up --build -d

# Back up the complete PostgreSQL database in PostgreSQL's custom format
docker compose exec -T db pg_dump -U chorebank -Fc -d chorebank > chorebank-backup.dump

# Restore: replace the database, stop at the first error, then restart the app.
docker compose stop app
if docker compose exec -T db pg_restore -U chorebank -d postgres --clean --if-exists --create --exit-on-error < chorebank-backup.dump; then
  docker compose start app
else
  docker compose start app
  exit 1
fi

# Recover a parent login by selecting and confirming the account interactively
docker compose exec app npm run password:reset
```

The `chorebank-postgres` Docker volume persists data across `docker compose down`. Do not use `docker compose down -v` unless you intentionally want to remove the database after taking a backup.

## Advanced: Node.js with PostgreSQL

Use Node.js 22+ and an existing PostgreSQL database.

```bash
npm ci
cp .env.example .env
# Set DATABASE_URL, DIRECT_URL, AUTH_SECRET, SETUP_TOKEN, and DEFAULT_HOUSEHOLD_ID in .env.
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Open `http://localhost:3000/setup`, or run `npm run setup` and enter the same slug as `DEFAULT_HOUSEHOLD_ID`.

For production, run `npm run build` followed by `npm run start`. PostgreSQL backups are your responsibility; use the `pg_dump` and `pg_restore` procedure above.

If a parent password is lost, run `npm run password:reset` from the application directory. The command lists existing parent accounts, requires an exact email confirmation, and prompts privately for a new 12+ character password. It changes no household data.

## Deployment and architecture

Docker Compose and PostgreSQL are the supported self-hosted path. Railway deployment is documented in [docs/railway.md](docs/railway.md). Vercel with a managed PostgreSQL provider remains possible with `npm run vercel-build`, but is optional rather than required.

See [architecture options](ARCHITECTURE_OPTIONS.md) for intentionally deferred SQLite, offline PWA, and native-tablet work.

## Scripts

```bash
npm run setup
npm run password:reset
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

`npm run prisma:seed` intentionally does not create a household. Use `npm run setup` once against an empty database instead.

## Demo mode

`http://localhost:3000/?mode=demo` is available for non-persistent development testing. It is disabled in production unless explicitly enabled.

## Security

To report a security issue, open a private GitHub security advisory. Do not include household data, credentials, or screenshots containing personal information.

## Support

Report public bugs and documentation issues through GitHub Issues. Use a private GitHub security advisory for vulnerabilities. Remove household data, credentials, and identifying screenshots from every report. Chorebank is self-hosted software and does not include guaranteed operational support.
