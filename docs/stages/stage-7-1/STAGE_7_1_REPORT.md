# Stage 7.1 CN Upload Fix Report

## Seal Information

- Repository: `su2517108202-blip/amazon-product-studio`
- Branch: `codex/stage-7-1-cn-upload-fix`
- Base seal commit: `87bcb319668c55bc8599c10a895e3c789afdc5cd`
- Stage tag: `stage-7-1-cn-upload-fix`
- Source instruction file: `docs/stages/stage-7-1/Stage_7_1_CN_Upload_Fix_Codex.md`

## Completed Scope

Stage 7.1 keeps Stage 7 result management intact and adds:

- Simplified Chinese user-facing UI copy across the project list, project creation, project studio, provider settings, product recognition, product identity, five-image planning, image generation, candidate history, preferred image management, download, ZIP export, loading, success, failure, empty, and confirmation states.
- Simplified Chinese natural-language requirements in product recognition, five-image planning, and final image-generation prompts.
- Runtime guards that reject whole-English product identity or five-image planning output for Chinese workflows.
- Hardened real reference-image upload validation and cleanup.
- A global Chinese font stack and readable desktop/mobile typography rules.
- Stage 7.1 upload and Chinese-output automated tests.
- Stage 7.1 UI acceptance screenshots, UI report, and sanitized machine-readable summary.

Out of scope:

- Stage 8 work.
- New paid image generation.
- Provider Adapter redesign.
- Automatic five-image generation.
- External editors, webhooks, or ComfyUI.

## Upload Failure Root Cause

The Stage 7 reference-image upload route trusted `file.type` from the browser and did not verify the actual bytes before saving. It also lacked a dedicated 12MB image limit, empty-file rejection, batch atomicity, and cleanup of files already written during a failed batch. In pre-fix browser reproduction, an empty PNG could return a successful response and appear in the project as a reference image.

## Upload Fix

- Added a 12MB per-reference-image limit.
- Allowed only `image/jpeg`, `image/png`, and `image/webp`.
- Validated magic-byte signatures for JPEG, PNG, and WebP.
- Rejected declared-MIME/signature mismatches.
- Rejected empty files before storage writes.
- Prevalidated full batches before creating database rows.
- Cleaned up saved files if a later database operation fails.
- Kept project ownership validation on the upload API.
- Ensured the storage directory is created automatically.
- Returned specific Chinese error messages without exposing local absolute paths or raw system errors.
- Preserved automatic primary-reference selection for the first uploaded image.

## Database Model Changes

No Prisma model changes were introduced in Stage 7.1.

## User-Facing Chinese Localization

Localized major user-visible text in:

- Homepage and project list.
- New project flow.
- Provider settings.
- Project studio.
- Reference image controls.
- Product recognition and product identity.
- Five-image planning.
- Image generation.
- Candidate history.
- Preferred image management.
- Single download and ZIP export.
- Loading, success, failure, empty, and confirmation states.
- Mobile project studio.

Technical values intentionally kept in English where appropriate:

- OpenAI, Gemini, DeepSeek, Doubao.
- Model ID, API, JSON, ZIP, MIME, HTTP.
- Protocol IDs and internal database field names.

## Chinese AI Output

Product recognition prompts now require simplified Chinese for natural-language fields such as product name, category, colors, materials, structure, visible functions, selling points, target users, usage scenarios, must-keep details, and avoid-changes details.

Five-image planning prompts now require simplified Chinese for selling points, scenes, composition, title, subtitle, detail notes, and final prompt language. JSON field names remain the required English schema keys.

Automated checks reject provider payloads that are mostly English for Chinese product identity or planning output.

## Font And Readability

Previous main issues:

- User-facing UI relied heavily on `text-xs`, `text-[10px]`, `text-[9px]`, `text-[11px]`, and `font-black`.
- Planning/candidate/history areas were visually cramped.
- Mobile form controls risked being too small for comfortable reading and tapping.

Global font stack:

```text
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
"PingFang SC",
"Microsoft YaHei",
"Noto Sans CJK SC",
"Noto Sans SC",
Arial,
sans-serif
```

Updated size rules:

- Desktop page titles: 24px to 28px.
- Desktop module titles: 18px to 20px.
- Card titles: 16px.
- Body and form content: 15px to 16px.
- Inputs, selects, and buttons: at least 14px.
- Helper text: at least 13px.
- Status labels: at least 12px.
- Mobile body text: at least 14px.
- Mobile inputs: at least 16px.
- Mobile page title: at least 22px.
- Tap targets: at least 42px high.
- Body line-height: at least 1.5.
- Longer planning and explanatory content: 1.6.

Cleanup result in main app source:

- `text-[10px]`: reduced from 23 occurrences to 0.
- `text-[9px]`: reduced from 8 occurrences to 0.
- `text-[11px]`: reduced from 4 occurrences to 0.
- `font-black`: reduced from 54 occurrences to 0.
- `text-xs`: removed from major user-facing UI; only a global compatibility rule remains in `globals.css`.

## Real UI Acceptance

Actual pages were started and opened in browser:

- `/`
- `/settings/providers`
- `/projects/cmrxtauxc000u3opgnmbeixjs`

Viewports:

- Desktop: `1440x900`
- Mobile: `390x844`

Acceptance project:

- Fresh Chinese project created for Stage 7.1.
- Uploaded reference images: `8`.
- Selected analysis references: `4`.
- Selected generation references: `4`.
- Primary reference: `tumbler-front.png`.
- Product identity saved: yes.
- Saved image plans: `5`.
- Five-image plans are Chinese: yes.

Browser console result:

- No blocking browser console errors observed.

Screenshots:

- `docs/stages/stage-7-1/ui-acceptance/01-chinese-project-list.png`
- `docs/stages/stage-7-1/ui-acceptance/02-chinese-provider-settings.png`
- `docs/stages/stage-7-1/ui-acceptance/03-upload-before.png`
- `docs/stages/stage-7-1/ui-acceptance/04-upload-success.png`
- `docs/stages/stage-7-1/ui-acceptance/05-chinese-product-identity.png`
- `docs/stages/stage-7-1/ui-acceptance/06-chinese-five-image-plans.png`
- `docs/stages/stage-7-1/ui-acceptance/07-mobile-chinese-project.png`

## Upload Acceptance Results

- Single JPG: passed.
- Single PNG: passed.
- Single WebP: passed.
- Chinese filename: passed.
- Filename with spaces: passed.
- Batch upload of 4 valid images: passed.
- Exceed reference-image limit: rejected with Chinese error.
- Non-image file: rejected with Chinese error.
- Empty file: rejected with Chinese error.
- Oversized file: rejected with Chinese error.
- Spoofed MIME/signature mismatch: rejected atomically in route test.
- Mixed valid/invalid batch: no partial rows and no orphan files in route test.
- Refresh recovery: passed.
- Service restart recovery: passed.

## Stage 7 Regression Results

- Candidate history: passed in automated regression.
- Set preferred image: passed in automated regression.
- Replace preferred image: passed in automated regression.
- Clear preferred image: passed in automated regression.
- Single-image download: passed in automated regression.
- Five-image preferred ZIP: passed in automated regression.
- Product recognition: passed in real UI acceptance.
- Five-image planning: passed in real UI acceptance.
- Single-image generation entry remains available and was not clicked during this acceptance.
- Existing project data remains available.

## Provider Call Accounting

- Real Gemini product recognition calls during Stage 7.1 acceptance: `1`.
- Real Gemini five-image planning calls during Stage 7.1 acceptance: `1`.
- New paid upstream image-generation calls during Stage 7.1 acceptance: `0`.

## Validation Commands

- `npx prisma generate --config prisma.config.ts`: passed.
- `npm run test:stage-7-1`: passed.
- `npm run test:stage-7`: passed.
- `npm run lint`: passed with existing 6 `<img>` warnings.
- `npm run build`: passed.

## Known Issues

- Existing 6 `<img>` lint warnings remain non-blocking.
- Existing npm audit advisories remain out of scope.
- No Stage 7.1 blocking issue remains.
