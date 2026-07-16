# Chorebank Open-Source V1 Readiness

Date: 2026-07-15  
Scope: first-run experience, authentication and recovery, security, email, operations, licensing, project quality, and low-technical deployment.

## Executive conclusion

Chorebank is ready to publish as a **high-quality open-source V1 for technical self-hosters** and a **hosted household beta**. Its core product, clean install, browser onboarding, login recovery, documentation, CI, security scanning, and repository presentation are all release-ready.

The remaining work is platform and owner activation rather than application development: authenticate the Railway CLI, verify a fresh two-service deployment, publish the Railway template, make the GitHub repository public, and tag the release. Until the fresh Railway deployment is observed, describe that route as a beta rather than proven one-click installation.

Overall readiness: **4.3/5**.

## Final execution-plan check

| Gate | Evidence | Result |
| --- | --- | --- |
| Core V1 product | Chores, stars, payday, coins, rewards, redemptions, household settings, responsive kid/parent UI | Pass |
| First run | Protected `/setup` flow plus equivalent terminal wizard; setup is transactional and permanently closes after success | Pass |
| Authentication lifecycle | Parent password and kid PIN login, authenticated password change, interactive owner recovery, normalized parent email | Pass |
| Security remediation | Public child enumeration removed; same-origin mutation guard and baseline security headers added | Pass |
| Real integration testing | Clean PostgreSQL migrations and required browser core-loop test in CI | Pass |
| Low-technical deployment code | Docker image, Railway definition, health endpoint, generated-secret and backup guide | Pass |
| Repository quality | MIT, polished README and screenshots, `llms.txt`, contributing/security/release docs, issue templates, Dependabot | Pass |
| Independent release gate | Validation, security scans, live E2E, local build, and code audit | Pass |
| Railway template | Fresh account deployment and published template URL | Owner action pending |
| Public release | Public visibility and `v0.1.0` tag/release | Owner approval pending |

## Readiness scorecard

| Area | Score | Assessment |
| --- | ---: | --- |
| Core chore/reward product | 4.6 | Complete household loop with broad domain and route coverage |
| First-run onboarding | 4.5 | Safe browser-first setup with CLI fallback; a short in-product tour is optional future polish |
| Authentication and recovery | 4.2 | Appropriate single-household password/PIN model and practical operator recovery |
| Security and privacy | 4.1 | Strong V1 baseline and automated gates; stateless session revocation and CSP remain defense-in-depth work |
| Backups and operations | 4.0 | Docker backup/restore and Railway backup guidance exist; owners must enable and test managed backups |
| Open-source project quality | 4.5 | Clear positioning, license, contribution/security paths, release record, screenshots, AI map, and automation |
| Low-technical deployment | 3.5 | Template-ready implementation exists; a fresh Railway template deployment still needs validation |

## First run and onboarding

A blank deployment redirects to `/setup`. The owner supplies the deployment's high-entropy `SETUP_TOKEN`, then creates the household, parent login, kid PIN, and first child. `DEFAULT_HOUSEHOLD_ID` supplies the canonical slug so there is no post-setup variable edit or restart. Creation is transactional, refuses existing household data, and disables setup after success.

Technical owners can use `npm run setup` or `docker compose exec app npm run setup` instead. The CLI and browser share validation and persistence logic, reducing behavioral drift.

Future niceties—not V1 blockers—are a first-week checklist, an optional product tour, and an in-product reminder to configure backups.

## Authentication, recovery, and email

Parent passwords and the shared kid PIN are bcrypt hashes. Parent email comparison is normalized. Sessions are signed HTTP-only SameSite cookies, Secure behind HTTPS, and expire after seven days. Parent and kid APIs enforce role authorization, and repeated login failures are limited.

Routine password changes are available while signed in. If the password is forgotten, the deployment owner runs:

```bash
npm run password:reset
# Docker
docker compose exec app npm run password:reset
# Railway
railway ssh --service chorebank
# Run this inside the app container.
npm run password:reset
```

The command lists parent accounts, requires exact email confirmation, privately prompts for a new 12+ character password, and does not alter household data. After suspected compromise, rotate `AUTH_SECRET` to invalidate all sessions.

Chorebank sends **no email**, and V1 should keep it that way. Mandatory SMTP would add provider setup, deliverability, abuse controls, reset-token storage, privacy disclosures, and a third party to an otherwise self-contained household app. The parent email is a login identifier, not a verified communications channel. Email recovery becomes worthwhile only for a future managed or multi-household service where the household owner is not also the database/platform owner.

## Security assessment

The V1 security posture is appropriate for a private single-household utility:

- No default production credentials; production requires `AUTH_SECRET` and setup requires a separate token.
- Central role guards and tests cover parent/kid authorization boundaries.
- Explicit cross-site authenticated mutations are blocked.
- Child names are no longer exposed through an unauthenticated discovery route.
- Zod validates API inputs; login rate limits and kid lockouts resist casual guessing.
- CI runs Semgrep, Gitleaks, Trivy, dependency auditing, coverage, and a live PostgreSQL browser test.
- Baseline `nosniff`, frame-denial, referrer, and browser-permission headers are applied.

The detailed [code audit](CODE_AUDIT_REPORT.md) records the remaining low/moderate risks. The main future hardening item is server-side session invalidation; a Content Security Policy should follow once it can be tested without breaking the UI.

## License recommendation

Use **MIT**, now declared consistently in `LICENSE`, `package.json`, and the README. It maximizes adoption by households, NAS/community packagers, educators, and small hosting/support providers, while remaining short and familiar. AGPL-3.0 would be preferable only if forcing hosted derivatives to publish changes matters more than low-friction adoption. Changing that policy after outside contributions is harder, so MIT should be treated as a deliberate choice. This is practical project guidance, not legal advice.

## Low-technical deployment

### Recommended: Railway template

Railway remains the best initial hosted route. Chorebank now supplies the application-side pieces:

- Docker build and production start configuration;
- automatic Prisma migrations before deployment;
- PostgreSQL-aware `/api/health` checks;
- browser setup that needs no shell access;
- reference-variable and generated-secret guidance;
- explicit backup, PITR, update, and password-recovery instructions.

The desired household flow is: **deploy template → wait for health → open the generated URL → copy the setup token → create household → sign in**.

The exact two-service configuration is in [docs/railway.md](docs/railway.md). Railway templates and their generated secrets are configured in Railway's template editor, so publishing cannot be completed solely through `railway.json`. Test the template in a fresh project before advertising it as one click. Railway's official documentation covers [creating templates](https://docs.railway.com/templates/create), [reference variables](https://docs.railway.com/variables/reference), [PostgreSQL](https://docs.railway.com/databases/postgresql), and [volume backups](https://docs.railway.com/volumes/backups).

### Alternatives

| Platform | Fit | Trade-off |
| --- | --- | --- |
| Render Blueprint | Best second hosted target; can define the web service, database, secrets, and deploy button in-repo | Another platform to maintain and generally a higher small-service baseline than Railway |
| Docker Compose | Best privacy and control; already the supported self-hosted path | Requires a server/NAS, terminal access, updates, TLS decisions, and backup ownership |
| Vercel plus managed PostgreSQL | Existing `vercel-build` path remains possible | Two-provider database setup is less approachable for this audience |

Do not add another platform until real users validate the Railway path.

## Release recommendation

Publish `v0.1.0` after these owner actions:

1. Authenticate Railway and create a disposable app + PostgreSQL deployment.
2. Complete `/setup`, test parent and kid login, restart/redeploy, and verify persistence and password recovery.
3. Convert the verified project into a Railway template and perform one clean template deployment.
4. Enable backups and document the observed restore/recovery behavior.
5. Approve public GitHub visibility, enable repository security/branch controls, and create the tagged GitHub release.

No email subsystem, multi-tenant architecture, SQLite port, offline PWA, native app, or custom installer is required for Chorebank V1.
