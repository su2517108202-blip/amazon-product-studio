# Known Failures

## Finding Counts

- P0: `0`
- P1: `0`
- P2: `6`
- P3: `2`
- P4: `2`

## AUD-P2-001 Date.now Filename Collision Risk

- Stage source: Stage 7.1 upload hardening.
- Severity: P2.
- Reproduction steps: upload two files with the same sanitized basename and extension in the same millisecond, especially in a fast batch or concurrent requests.
- Expected: every uploaded file gets a collision-resistant storage key.
- Actual: `sanitizeFileName()` appends `Date.now()` only, and `saveProjectReference()` writes directly to that path.
- Code location: `src/lib/storage.js:12-20`, `src/lib/storage.js:46-62`.
- Test gap: no test freezes time or runs parallel same-name uploads to detect overwritten files.
- Suggested fix stage: Stage 8 hardening before wider use.

## AUD-P2-002 Header-Only Image Validation Risk

- Stage source: Stage 7.1 upload hardening.
- Severity: P2.
- Reproduction steps: upload a corrupt file that starts with a valid JPEG/PNG/WebP header but cannot be decoded as an image.
- Expected: corrupted image payload is rejected.
- Actual: `detectImageMime()` validates magic bytes only; it does not decode or verify full image integrity.
- Code location: `src/lib/storage.js:198-215`, `src/app/api/projects/[projectId]/reference-images/route.js:156-168`.
- Test gap: no damaged-valid-header image fixture.
- Suggested fix stage: Stage 8 upload hardening.

## AUD-P2-003 Concurrent Upload Can Exceed 14 Image Limit

- Stage source: Stage 7.1 upload hardening.
- Severity: P2.
- Reproduction steps: start two upload requests concurrently when a project has fewer than 14 images and combined uploads exceed the limit.
- Expected: final project never exceeds 14 reference images.
- Actual: existing count is read before the transaction; concurrent requests can each pass the limit check.
- Code location: `src/app/api/projects/[projectId]/reference-images/route.js:30-50`, `src/app/api/projects/[projectId]/reference-images/route.js:67-112`.
- Test gap: sequential over-limit test exists, true concurrent limit test does not.
- Suggested fix stage: Stage 8 data integrity hardening.

## AUD-P2-004 Concurrent First Upload Can Create Multiple Primary Images

- Stage source: Stage 7.1 upload hardening.
- Severity: P2.
- Reproduction steps: send two first-upload requests concurrently to a new project.
- Expected: exactly one primary reference image exists.
- Actual: `isPrimary` is computed from the initial `project.referenceImages.length`; concurrent first uploads can both compute `nextIndex === 0`.
- Code location: `src/app/api/projects/[projectId]/reference-images/route.js:67-95`.
- Test gap: no true concurrent first-upload test.
- Suggested fix stage: Stage 8 data integrity hardening.

## AUD-P2-005 Stored Extension Follows Client Filename

- Stage source: Stage 7.1 upload hardening.
- Severity: P2.
- Reproduction steps: upload valid PNG bytes with an allowed browser MIME but a misleading filename extension.
- Expected: stored extension is derived from detected MIME.
- Actual: `sanitizeFileName()` keeps the client extension; `saveProjectReference()` does not use `imageExtension(detectedMime)` for reference images.
- Code location: `src/lib/storage.js:12-20`, `src/lib/storage.js:46-62`.
- Test gap: no allowed-MIME misleading-extension test.
- Suggested fix stage: Stage 8 upload hardening.

## AUD-P2-006 Dependency Security Advisories

- Stage source: current dependency tree.
- Severity: P2.
- Reproduction steps: run `npm audit --json`.
- Expected: no high or critical advisories.
- Actual: 14 vulnerabilities reported: 4 moderate, 9 high, 1 critical. Direct packages include `axios`, `next`, `next-auth`, and `prisma`.
- Code location: `package.json`, `package-lock.json`.
- Test gap: CI does not fail on npm audit.
- Suggested fix stage: dependency maintenance stage before public deployment.

## AUD-P3-001 Project Studio Mojibake

- Stage source: Stage 7.1 Chinese localization/readability.
- Severity: P3.
- Reproduction steps: open `/projects/cmrwl7jxk0000ogpgkfjbah7g` or a newly created project in the browser.
- Expected: simplified Chinese labels render normally.
- Actual: many project studio labels render as mojibake, while user-entered project data still renders correctly.
- Code location: `src/app/projects/[projectId]/ProjectStudioClient.js:21-36`, `src/app/projects/[projectId]/ProjectStudioClient.js:114-120`, `src/app/projects/[projectId]/ProjectStudioClient.js:806-866`, `src/app/projects/[projectId]/ProjectStudioClient.js:1031-1156`, `src/app/projects/[projectId]/ProjectStudioClient.js:1356-1517`.
- Test gap: Stage 7.1 tests verify output language but do not fail on source mojibake or browser-visible mojibake.
- Suggested fix stage: immediate Stage 7.2 UI text repair before Stage 8.

## AUD-P3-002 Remaining English UI Text

- Stage source: Stage 7.1 Chinese localization.
- Severity: P3.
- Reproduction steps: open homepage and project list.
- Expected: all user-facing non-technical copy is simplified Chinese.
- Actual: homepage still shows `Lingtu E-commerce Studio` and `Local`; brand text `Amazon Product Studio` also remains in nav.
- Code location: `src/app/page.js`, `src/components/Navbar.js`.
- Test gap: no exhaustive UI text localization test.
- Suggested fix stage: Stage 7.2 UI text repair.

## AUD-P4-001 Local And Remote Stage 6.1 Refs Differ

- Stage source: repository maintenance.
- Severity: P4.
- Reproduction steps: compare local `stage-6-1-hardening` with remote refs.
- Expected: local stage branch/tag metadata matches remote or is clearly documented.
- Actual: local branch/tag state differs from remote stage 6.1 ref; remote tag points to the corrected seal commit, and the audit did not move it.
- Code location: Git refs, not source code.
- Test gap: no automated ref consistency check.
- Suggested fix stage: repository hygiene task, with explicit user approval if any local cleanup is desired.

## AUD-P4-002 Node ESM Typeless Warnings

- Stage source: test/runtime configuration.
- Severity: P4.
- Reproduction steps: run stage scripts.
- Expected: no runtime module type warnings.
- Actual: Node reports `MODULE_TYPELESS_PACKAGE_JSON` warnings for ESM files because `package.json` lacks `"type": "module"`.
- Code location: `package.json`, `src/lib/prisma.js`, `src/lib/image-planning.js`.
- Test gap: CI does not fail on warnings.
- Suggested fix stage: maintenance stage after deciding module type strategy.
