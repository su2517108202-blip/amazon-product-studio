# Stage 7 Result Management Report

## Seal Information

- Repository: `su2517108202-blip/amazon-product-studio`
- Branch: `codex/stage-7-result-management`
- Base seal commit: `46026762c4364dc7af5fbd81637d9bce6c64e640`
- Implementation commit: `0ff10b893309bffa6e3c3688838fb7bdf43f33d1`
- Stage tag: `stage-7-result-management`
- Source instruction file: `docs/stages/stage-7/Stage_7_Result_Management_Codex.md`

## Completed Scope

Stage 7 adds result management for already generated ecommerce image candidates.

- Candidate history is shown per `ImagePlan`.
- Users can set, replace, and clear one preferred image per plan.
- Non-preferred generated images can be soft-deleted with confirmation.
- Preferred generated images cannot be directly deleted.
- Single generated images can be downloaded with safe filenames and correct MIME.
- When all 5 image plans have preferred images, a ZIP export is available.
- The ZIP contains exactly the 5 preferred images in plan order.
- Failed or deleted candidates do not remove successful history.
- Existing Stage 6 and Stage 6.2 generation/auth behavior remains covered by tests.

Out of scope for this stage:

- Stage 8 work.
- Automatic five-image generation.
- New paid image generation during UI acceptance.
- Webhooks, external editors, or ComfyUI integration.

## Database Model Changes

- `ImagePlan.preferredGeneratedImageId`: optional unique pointer to the preferred candidate.
- `ImagePlan.preferredGeneratedImage`: relation to `GeneratedImage` with `onDelete: SetNull`.
- `GeneratedImage.deletedAt`: soft-delete timestamp.
- `GeneratedImage.preferredForPlans`: reverse preferred relation.
- `GeneratedImage` keeps the existing unique `(generationRunId, outputIndex)` idempotency guard.
- `ImageGenerationRun.isForcedVersion`: records forced version generation attempts.
- New migration: `prisma/migrations/202607230007_stage7_result_management/migration.sql`

## API Changes

- `GET /api/projects/[projectId]/image-plans/[planId]/generated-images`
- `PATCH /api/projects/[projectId]/image-plans/[planId]/preferred-image`
- `DELETE /api/generated-images/[imageId]`
- `GET /api/generated-images/[imageId]/download`
- `GET /api/projects/[projectId]/exports/preferred-images`
- `GET /api/projects/[projectId]/generation-summary`

Existing generation, async check, and storage APIs now exclude soft-deleted images where applicable.

## UI Actual Startup Result

The local Next.js app was started and actually visited in browser.

- Project list: `http://localhost:3000`
- Provider settings: `http://localhost:3000/settings/providers`
- Stage 4 Gemini Acceptance project studio: `http://localhost:3000/projects/cmrwl7jxk0000ogpgkfjbah7g`

Browser viewports checked:

- Desktop: `1440x900`
- Mobile: `390x844`

Console result: no blocking browser console errors were observed on the checked pages.

## UI Acceptance Screenshots

- `docs/stages/stage-7/ui-acceptance/01-project-list.png`
- `docs/stages/stage-7/ui-acceptance/02-provider-settings.png`
- `docs/stages/stage-7/ui-acceptance/03-reference-images.png`
- `docs/stages/stage-7/ui-acceptance/04-product-identity.png`
- `docs/stages/stage-7/ui-acceptance/05-five-image-plans.png`
- `docs/stages/stage-7/ui-acceptance/06-candidate-history.png`
- `docs/stages/stage-7/ui-acceptance/07-preferred-image.png`
- `docs/stages/stage-7/ui-acceptance/08-single-download.png`
- `docs/stages/stage-7/ui-acceptance/09-five-of-five-progress.png`
- `docs/stages/stage-7/ui-acceptance/10-zip-export.png`
- `docs/stages/stage-7/ui-acceptance/11-mobile-project.png`
- `docs/stages/stage-7/ui-acceptance/12-mobile-candidate-history.png`

## Candidate And Preferred Image Results

The acceptance project retained the real Stage 6 Gemini-generated image history for plan 1:

- Plan 1 real provider candidates: 3 Gemini JPEG candidates.
- Preferred plan 1 candidate after acceptance: `d50ca300-8179-4f7b-adbf-cdadc3d93e5e`.
- Provider: `gemini`
- Model: `gemini-3.1-flash-image`
- Protocol: `gemini-native-image`

Controlled local candidates were added for Stage 7 UI/export validation only:

- Plan 2: `stage7-ui-zip-structure-image`
- Plan 3: `stage7-ui-zip-function-image`
- Plan 4: `stage7-ui-zip-scenario-image`
- Plan 5: `stage7-ui-zip-detail-image`

A non-preferred local candidate on plan 1 was deleted through the UI and remained soft-deleted:

- `stage7-ui-delete-candidate-image`

Results:

- Multiple candidates can be viewed.
- Setting a preferred image works.
- Replacing a preferred image works.
- Clearing a preferred image works.
- Preferred state persists after refresh.
- Preferred state persists after service restart.
- Candidate counts and preferred state display correctly across all five plans.
- Preferred candidates are protected from direct delete.
- Non-preferred candidates require confirmation before delete.

## Download Results

Single-image download was validated through the app route.

- Route: `/api/generated-images/stage7-ui-zip-structure-image/download`
- Status: `200`
- MIME: `image/png`
- Filename: `02-structure-candidate-01.png`
- File signature: valid PNG
- Result: downloaded file opened successfully.

ZIP export was validated after all five plans had preferred images.

- Route: `/api/projects/cmrwl7jxk0000ogpgkfjbah7g/exports/preferred-images`
- Status: `200`
- MIME: `application/zip`
- Filename: `Stage-4-Gemini-Acceptance-preferred-images.zip`
- ZIP entries:
  - `01-hero.jpg`
  - `02-structure.png`
  - `03-function.png`
  - `04-scenario.png`
  - `05-detail.png`
- Result: ZIP extracted to exactly 5 images in the expected order.

When preferred completion was temporarily reduced to `4/5`, the ZIP button was disabled and showed the missing plan.

## Desktop And Mobile Results

Desktop `1440x900`:

- Project list displayed normally.
- Provider settings displayed normally.
- API key was not exposed in full.
- Project studio displayed reference images, identity, plans, candidate history, preferred state, download actions, and ZIP export.
- No severe horizontal overflow or obstructed action buttons were observed.

Mobile `390x844`:

- Project studio remained readable.
- Candidate cards were readable.
- Five image-plan tabs could be switched.
- Download and preferred controls were available.
- No severe horizontal overflow was observed.

## Provider Call Accounting

No new paid upstream image generation was triggered during Stage 7 UI acceptance.

- Upstream new image calls during UI acceptance: `0`
- Gemini image-generation run count before UI acceptance: `10`
- Gemini image-generation run count after UI acceptance: `10`
- Latest Gemini run stayed unchanged: `cmrxiyjl40000v4pg65ptet5l`

Real provider historical images:

- Plan 1 Gemini candidates from earlier Stage 6 validation.

Stage 7 local controlled test candidates:

- Plan 2 to plan 5 ZIP/export validation candidates.
- One plan 1 non-preferred delete-protection validation candidate.

## Validation Commands

- `npx prisma format --config prisma.config.ts`: passed
- `npx prisma generate --config prisma.config.ts`: passed
- `npx prisma migrate dev --config prisma.config.ts`: passed
- Migration deploy smoke on temporary empty database: passed
- `npm run test:stage-6-1`: passed
- `npm run test:stage-6-2`: passed
- `npm run test:stage-7`: passed
- `npm run lint`: passed with the existing 6 `<img>` warnings
- `npm run build`: passed

## Known Issues

- Existing 6 `<img>` lint warnings remain from prior stages and are non-blocking.
- Existing npm audit advisories remain out of scope.
- No Stage 7 blocking issue remains.
