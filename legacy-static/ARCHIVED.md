## Archived Prototype

`legacy-static/app.js` and `src/lib/kids-chore-app.js` are legacy prototype bundles kept only for reference.

- They are not imported by the active Next.js app.
- CI runs `node scripts/check-legacy-isolation.mjs` to block new references.
- New product work should happen in `src/` TypeScript modules only.
