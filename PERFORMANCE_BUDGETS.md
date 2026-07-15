# Performance Budgets (p95)

Last updated: 2026-03-09 (America/Vancouver)

## Scope
These budgets cover the primary parent-admin interactions that can feel slow in household use.

The app tracks session-level performance samples in four buckets and computes p95 from the most recent 40 samples.

## Target Budgets

| Bucket | Target p95 | Notes |
| --- | ---: | --- |
| `settingsLoad` | `<= 800ms` | Fetching parent settings/admin data domains. |
| `mutation` | `<= 700ms` | Non-reorder admin writes (save child, save reward, assign chore, add child, etc.). |
| `reorder` | `<= 450ms` | Chore/reward drag-drop reorder save call. |
| `transition` | `<= 180ms` | Route-backed navigation transitions (`/kids`, `/store`, `/parent/*`). |

## Where to View
- Parent -> Settings -> App section.
- Card label: `Performance (Session p95)`.
- For each bucket it shows:
  - current p95
  - target threshold
  - sample count in current session

## UX Rules During Slow Operations
- Every admin write path must show explicit in-flight feedback (`Saving...`, disabled action, or loading affordance).
- Reorder must show drop target indicator and temporary lock while request is in flight.
- UI must avoid full-page loading interstitials on route navigation after initial auth/bootstrap.

## Escalation Criteria
- If any bucket p95 exceeds target over multiple sessions:
  1. Capture endpoint timings (server + network).
  2. Check payload size and duplicated refetches.
  3. Replace broad refreshes with scoped refreshes for only affected domains.
  4. Add/adjust optimistic state so interaction latency remains understandable to users.

