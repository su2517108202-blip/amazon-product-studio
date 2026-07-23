# File Manifest

## Core Source

- `src/app/`
- `src/components/`
- `src/lib/`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`

## Stage Scripts

- `scripts/stage-6-1-acceptance.mjs`
- `scripts/stage-6-2-async-auth-tests.mjs`
- `scripts/stage-7-result-management-tests.mjs`
- `scripts/stage-7-1-upload-tests.mjs`
- `scripts/stage-7-1-cn-output-tests.mjs`

No dedicated stage 1 to stage 5 automated command is present in `package.json`.

## Stage Reports And Summaries

- `STAGE1_BASELINE.md`
- `STAGE_5_REPORT.md`
- `STAGE_6_REPORT.md`
- `PROJECT_CONTEXT.md`
- `docs/stages/stage-6/`
- `docs/stages/stage-6-1/`
- `docs/stages/stage-6-2/`
- `docs/stages/stage-7/`
- `docs/stages/stage-7-1/`

## Audit Package

- `docs/audit/pre-stage-8/REPOSITORY_REFS.md`
- `docs/audit/pre-stage-8/COMMIT_AND_TAG_MATRIX.md`
- `docs/audit/pre-stage-8/FILE_MANIFEST.md`
- `docs/audit/pre-stage-8/MIGRATION_CHAIN.md`
- `docs/audit/pre-stage-8/ROUTE_AND_PERMISSION_MATRIX.md`
- `docs/audit/pre-stage-8/PROVIDER_AND_ROLE_MATRIX.md`
- `docs/audit/pre-stage-8/UI_AND_WORKFLOW_MATRIX.md`
- `docs/audit/pre-stage-8/TEST_COVERAGE_MATRIX.md`
- `docs/audit/pre-stage-8/REAL_BROWSER_SMOKE.md`
- `docs/audit/pre-stage-8/KNOWN_FAILURES.md`
- `docs/audit/pre-stage-8/SECURITY_REVIEW.md`
- `docs/audit/pre-stage-8/AUDIT_SUMMARY.json`

## Explicitly Excluded

The audit package does not include `.env`, `.env.*`, `storage/`, `tmp/`, `node_modules/`, `.next/`, database dumps, real generated image bundles, secrets, Authorization headers, cookies, session tokens, image Base64, or local absolute sensitive paths.
