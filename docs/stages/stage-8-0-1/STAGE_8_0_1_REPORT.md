# Stage 8.0.1 CI Hotfix Report

## Scope

Stage 8.0.1 is a CI hotfix only. It does not start Stage 9 and does not add product features or paid provider calls.

Branch: `codex/stage-8-0-1-ci-hotfix`

Base tag: `stage-8-final-release`

Base commit: `1505c34e2fa69940af211cb8d948e927d74c9721`

## Failure Diagnosis

Failed GitHub Actions run: `30096658987`

Failed job: `89492278597`

Failing step: `Stage 7.2.1 Playwright upload E2E`

Real failure location: `scripts/stage-7-2-1-upload-e2e.mjs:78`

Expected result: project creation POST returns HTTP `201`.

Actual result: project creation POST returned HTTP `500`, causing `AssertionError [ERR_ASSERTION]: 500 !== 201`.

The old Stage 7.2.1 test did not persist the failing response body, page screenshot, browser console/pageerror output, or Next server tail logs, so the remote run could only prove the failing assertion and status code. The hotfix adds those diagnostics for future Playwright failures.

Why Windows passed while GitHub Ubuntu failed: the local Windows run used the development-server path and completed the create/upload flow. The GitHub job had already completed `npm run build`, but the Stage 7.2.1 script deleted `.next` and forced a fresh `next dev` startup inside Ubuntu CI. That made the CI path differ from the built production path and left no diagnostic artifacts when the create POST returned 500. The fix makes CI use the already-built `.next` via `next start` and keeps development mode for local non-CI runs.

Classification: CI harness and cross-platform timing/observability issue, not a business-code feature defect.

## Hotfix Changes

- Stage 7.2.1 Playwright E2E now uses the existing production build in CI and preserves real JPG, PNG, and WebP `setInputFiles` upload coverage.
- Stage 7.2.1 failures now save a browser screenshot, browser console/pageerror log, page resource list, sanitized Next tail log, response body, and failure summary.
- Stage 8 Playwright E2E now also uses the existing production build in CI.
- Stage 8 generation checks now bind controls to the target plan id, wait for target plan data, and use same-origin API calls against the local fake provider to force one real generation per plan without paid calls.
- CI now runs `npm run test:stage-8` after Stage 7.2.1.
- CI uploads sanitized Playwright diagnostics on failure with `actions/upload-artifact@v4`.

## Validation

Local validation passed on Windows with PostgreSQL and CI-style environment variables:

- `npm ci`
- `npx prisma generate --config prisma.config.ts`
- `npx prisma migrate deploy --config prisma.config.ts`
- `npm run test:stage-6-1`
- `npm run test:stage-6-2`
- `npm run test:stage-7`
- `npm run test:stage-7-1`
- `npm run test:stage-7-2`
- `npm run test:ui-text`
- `npm run test:stage-7-2-1`
- `npm run test:stage-8`
- `npm audit --omit=dev --audit-level=high`
- `npm run lint`
- `npm run build`

Production audit critical: `0`

Production audit high: `0`

Lint: passed with `0` errors and existing `<img>` warnings.

Build: passed.

Paid provider calls added: `0`
