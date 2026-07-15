# Chorebank V1 Code Audit

Date: 2026-07-15  
Audited revision: `bc342ca` plus this report's Node.js engine declaration

## Result

**Release gate: pass.** No confirmed critical or high-severity finding remains. The repository is a healthy small application with strong automated coverage and a few explicitly documented defense-in-depth and maintainability follow-ups.

## Evidence

- GitHub CI ran lint, type checking, 104 Vitest tests with coverage, a domain-coverage gate, a production build, and a real PostgreSQL Playwright flow.
- The security job ran Semgrep's OWASP and secret rules, Gitleaks across full history, and Trivy for critical/high filesystem vulnerabilities. All passed in [run 29432879492](https://github.com/dhalarewich/chorebank/actions/runs/29432879492).
- A fresh local `npm audit --omit=dev --audit-level=high` passed its high-severity gate. It reported only the moderate PostCSS advisory described below.
- The code-audit structural scanner examined 133 files and 12,582 lines; Madge found no circular imports.
- Local lint, type checking, all 104 tests, and a production build passed after the three V1 feature branches were integrated.

## Confirmed findings

| Severity | Finding | Disposition |
| --- | --- | --- |
| Moderate | Next.js currently brings `postcss <8.5.10`, affected by GHSA-qx2v-qp2m-jg93. npm's proposed forced fix downgrades Next.js to 9.x and is unsafe. | Track the upstream Next.js release through Dependabot; do not run `npm audit fix --force`. The high/critical release gate passes. |
| Moderate | Sessions are signed, stateless tokens with a seven-day expiry and no per-user server-side revocation. A password change does not invalidate a copied session. | Accept for single-household V1. Rotate `AUTH_SECRET` after suspected compromise; consider a credential/session version before positioning Internet hosting as zero-maintenance. |
| Low | Browser setup has a high-entropy constant-time-compared setup token and closes permanently after success, but has no dedicated attempt limiter. | Generated 32-byte template tokens make guessing impractical. Add a limiter if setup abuse appears in hosted deployments. |
| Low | Baseline headers include clickjacking, MIME-sniffing, referrer, and browser-permission protections, but not a CSP. HSTS belongs at the HTTPS proxy/platform boundary. | Add a tested CSP after inventorying inline UI requirements; configure HSTS in the hosting layer. |
| Low | Four modules are large: `ChoreBoardApp.tsx`, `useChoreBoardApp.ts`, `admin-service.ts`, and `board-service.ts`. | Refactor only when changing the affected area; current domain tests reduce regression risk. |

## Automated false positives triaged

The baseline regex scanner initially labeled several safe patterns as high severity. They are not release findings:

- Database URLs in CI contain disposable local test credentials; Compose interpolates the owner's uncommitted `POSTGRES_PASSWORD`.
- Password and setup-token literals are fixtures under `tests/`.
- The development-only authentication secret is rejected in production.
- Three `innerHTML` assignments insert fixed SVG markup without user-controlled input.
- `http://www.w3.org/2000/svg` is an XML namespace identifier, not a network request.

## Security posture

Passwords and kid PINs are bcrypt hashes. Production requires a unique `AUTH_SECRET`; sessions use HMAC signatures, HTTP-only SameSite cookies, expiry, and Secure cookies on HTTPS. Authorization is centralized and role-tested. Mutating authenticated routes reject explicit cross-origin requests. Login attempts are rate-limited, kid PIN failures lock temporarily, input boundaries use Zod, demo mode is production-disabled by default, and the unused public child-name endpoint has been removed.

This remains household-private software. Operators must patch the host and images, use HTTPS beyond a trusted LAN, protect Railway/GitHub accounts, back up PostgreSQL, and test restores.

## Next audit

Repeat this gate before each tagged release and whenever authentication, tenancy, setup, session handling, or deployment infrastructure changes.
