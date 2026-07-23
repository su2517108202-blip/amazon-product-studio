# Stage 7.2.1 Final Closure Report

## Scope

- Baseline tag: `stage-7-2-pre-stage-8-remediation`
- Baseline commit: `5cd997bc31b9b78504d1596f73cc4c85be9851ac`
- Branch: `codex/stage-7-2-1-final-closure`
- Implementation commit: `fecb3bd1ee0f63657b18d38c008079504ea55ebc`
- Stage tag: `stage-7-2-1-final-closure`
- Stage 8 work: not started

## Closure Items

- CI now runs `test:stage-7-2`, `test:ui-text`, `test:stage-7-2-1`, and production high-level audit.
- Reference-image validation now keeps magic-byte and metadata checks, then forces full pixel decode through `sharp(...).rotate().raw().toBuffer()`.
- Reference-image decode limit is now `25,000,000` pixels.
- Stage 7.1 upload fixtures were replaced with genuinely decodable JPG, PNG, and WebP samples.
- Stage 7.2 tests now reject middle-corrupted PNG, JPEG, and WebP payloads.
- Project studio removed readable `text-[10px]` and excessive `font-black` usage.
- Reference-image file selector now only exposes JPG, PNG, and WebP.
- Candidate pagination now queries `limit + 1` and only returns `nextCursor` when another page exists.
- Pagination tests cover both 24 candidates and 25 candidates.
- Primary reference-image switching now runs in a project-locked transaction, updates cover image in the same transaction, and marks ProductIdentity plus ImagePlan records stale.
- Concurrent primary-switch testing confirms exactly one primary remains and cover image follows it.
- The Stage 7.2 acceptance summary field was corrected from `remainingEnglishUserLabels` to `englishUserLabelsRemoved`.

## Verification

- `npm ci`: passed
- `npx prisma format --config prisma.config.ts`: passed
- `npx prisma generate --config prisma.config.ts`: passed
- Empty PostgreSQL `prisma migrate deploy --config prisma.config.ts`: passed
- `npm run test:stage-6-1`: passed
- `npm run test:stage-6-2`: passed
- `npm run test:stage-7`: passed
- `npm run test:stage-7-1`: passed
- `npm run test:stage-7-2`: passed
- `npm run test:ui-text`: passed
- `npm run test:stage-7-2-1`: passed
- `npm audit --omit=dev --audit-level=high`: passed
- `npm run lint`: passed with 6 existing `<img>` warnings
- `npm run build`: passed

## Audit Counts

- production npm audit critical: `0`
- production npm audit high: `0`
- remaining moderate findings: `3`, through Prisma CLI development dependency chain

## UI Evidence

- Playwright used a real Chromium browser.
- Upload was performed through the real `<input type="file">` control via `setInputFiles()`.
- Network captured one `POST /api/projects/[projectId]/reference-images`.
- Uploaded images: JPG, PNG, WebP.
- First image became primary.
- Refresh recovery passed.
- Mobile `390x844` had no severe horizontal overflow.
- New paid Provider image-generation calls: `0`

Screenshots:

- `docs/stages/stage-7-2-1/ui-acceptance/01-upload-file-input.png`
- `docs/stages/stage-7-2-1/ui-acceptance/02-upload-progress.png`
- `docs/stages/stage-7-2-1/ui-acceptance/03-upload-thumbnails.png`
- `docs/stages/stage-7-2-1/ui-acceptance/04-readable-candidates.png`
- `docs/stages/stage-7-2-1/ui-acceptance/05-mobile-readable.png`

## Residual Notes

- Existing 6 `<img>` lint warnings remain unchanged.
- No Stage 8 features were implemented.
