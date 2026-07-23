# Stage 7.2 Pre-Stage-8 Remediation Report

## Scope

- Baseline: `pre-stage-8-full-audit` / `77b476aff85c5bc3971957ba3750f98c4b074431`
- Branch: `codex/stage-7-2-pre-stage-8-remediation`
- Implementation commit: `9c376193ab967770b6793bac4a9caeb35840192a`
- Stage tag: `stage-7-2-pre-stage-8-remediation`
- Stage 8 work: not started

## Remediated Audit Findings

- Fixed project-studio mojibake by restoring the Stage 7 workspace surface and reapplying Stage 7.1/7.2 Chinese UI and pagination changes.
- Removed remaining user-facing English brand/local labels from the home page and navigation.
- Replaced `Date.now()` reference-image file names with collision-resistant UUID names.
- Stored reference-image extensions from the detected image MIME, not from the client filename.
- Added full image decoding validation with `sharp` for JPEG, PNG, and WebP reference uploads.
- Added serialized project-level upload transactions with PostgreSQL advisory locks.
- Enforced the 14 reference-image limit inside the locked transaction.
- Added a partial unique index so only one primary reference image can exist per project.
- Hardened first-upload behavior so concurrent first uploads still leave exactly one primary image.
- Disabled the legacy MUAPI upload route in local mode and removed unsafe upstream error/log exposure.
- Added explicit Provider reference-image capability status for generated-image protocols.
- Added paginated candidate history loading for ImagePlan generated-image candidates.
- Reduced production dependency audit risk to zero critical and zero high advisories.

## Database Changes

- Added migration: `prisma/migrations/202607240000_stage7_2_reference_upload_integrity/migration.sql`
- Migration behavior:
  - Keeps only the earliest primary reference image per project when legacy data has more than one.
  - Adds `ReferenceImage_one_primary_per_project`, a unique partial index on `ReferenceImage(projectId)` where `isPrimary = true`.

## Upload Validation

- Allowed MIME results: `image/jpeg`, `image/png`, `image/webp`
- Maximum reference-image file size: `12MB`
- Validation now checks:
  - browser MIME is allowed
  - magic bytes indicate a supported image
  - decoded image metadata is valid
  - dimensions exist and are non-zero
  - pixel count is within the configured decode limit
  - stored extension matches detected MIME
  - project belongs to the current user
  - batch upload is atomic
  - saved files are removed when a later step fails

## Real UI Acceptance

- Routes opened:
  - `/`
  - `/settings/providers`
  - `/projects/cmrxz44ft0000f8pg6tyda8yo`
- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Browser console blocking errors: none observed
- New paid Provider image-generation calls during this stage: `0`
- The in-app browser environment did not support direct file chooser uploads, so upload API behavior was exercised against the same running local app after the UI failure was recorded. The project page was refreshed in-browser to verify the resulting thumbnails, primary image state, candidate history, and Chinese UI.

Screenshots:

- `docs/stages/stage-7-2/ui-acceptance/01-home-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/02-navbar-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/03-provider-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/04-upload-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/05-project-studio-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/06-five-plans-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/07-candidate-pagination.png`
- `docs/stages/stage-7-2/ui-acceptance/08-mobile-cn.png`

## Verification

- `npm ci`: passed
- `npx prisma format --config prisma.config.ts`: passed
- `npx prisma generate --config prisma.config.ts`: passed
- `npx prisma migrate dev --config prisma.config.ts`: passed
- Empty PostgreSQL migration deploy: passed
- `npm run test:stage-6-1`: passed
- `npm run test:stage-6-2`: passed
- `npm run test:stage-7`: passed
- `npm run test:stage-7-1`: passed
- `npm run test:stage-7-2`: passed
- `npm run test:ui-text`: passed
- `npm run lint`: passed with 6 existing `<img>` warnings
- `npm run build`: passed
- `npm audit --omit=dev --json`: 0 critical, 0 high, 3 moderate

## Residual Notes

- Existing `<img>` lint warnings remain unchanged.
- `npm audit --omit=dev` still reports 3 moderate findings through Prisma CLI development dependencies, but production critical and high counts are zero.
- Stage 8 features were not implemented.
