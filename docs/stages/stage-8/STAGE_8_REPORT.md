# Stage 8 Final Release Report

## Scope

- Baseline tag: `stage-7-2-1-final-closure`
- Baseline commit: `b22112467b1ed72eb1c9b4d0309322aa9d1d2d5e`
- Branch: `codex/stage-8-final-release`
- Implementation commit: `ce853f08e6e3d39169df5a6af01d12c66119c943`
- Stage 8 is the final formal stage. Stage 9 was not started.

## Implemented

- Added the four-step local workflow navigation: reference images, product identity, five-image planning, image generation and export.
- Added explicit Chinese disabled-button reasons for recognition, planning and image generation actions.
- Moved provider, model, protocol, run and fingerprint details into advanced information sections.
- Kept confirmation dialogs for re-recognition, re-planning, forced generation, candidate deletion, reference deletion and project deletion.
- Added Windows local startup and diagnostics:
  - `start-lingtu.bat`
  - `scripts/start-local.ps1`
  - `scripts/doctor-local.mjs`
  - `README_LOCAL_ZH.md`
- Hardened primary reference deletion with a project lock and transaction for primary reassignment, cover update, and stale ProductIdentity/ImagePlan marking.
- Hardened project deletion so storage cleanup must succeed before the API reports success.
- Bypassed proxy handling for localhost Provider URLs so local fake Provider tests receive real multipart FormData.
- Hardened local-mode auth wiring so local mode does not expose login, recharge, Stripe, or template-publishing flows.
- Added `npm run test:stage-8` with Playwright Chromium, a controlled local fake Provider, real file input upload, restart recovery, ZIP validation, deletion cleanup and screenshot evidence.

## Paid Calls

Stage 8 新增收费图片生成调用：0

The Stage 8 fake Provider is local and controlled. No new paid Provider, SaaS billing, Stripe, credit, multi-tenant, mobile app, or Stage 9 work was added.

## Verification

- `npm ci`: passed
- `powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1`: passed
- `npx prisma generate`: passed
- `npx prisma migrate deploy`: passed, no pending migrations
- `npm run test:stage-6-1`: passed
- `npm run test:stage-6-2`: passed
- `npm run test:stage-7`: passed
- `npm run test:stage-7-1`: passed
- `npm run test:stage-7-2`: passed
- `npm run test:ui-text`: passed
- `npm run test:stage-7-2-1`: passed
- `npm run test:stage-8`: passed
- `npm audit --omit=dev --audit-level=high`: passed
- `npm run lint -- --quiet`: passed
- `npm run build`: passed

Production audit result:

- critical: 0
- high: 0

## Stage 8 Browser Flow

The final Playwright flow completed:

- Chinese project creation from the home page.
- Real `<input type="file">` upload for JPG, PNG and WebP.
- Product recognition through the configured role binding and Provider adapter.
- Five-image planning through the configured role binding and Provider adapter.
- One edited plan saved through the UI.
- Five plan-by-plan image generations through the configured image-generation adapter.
- One forced regeneration while preserving the old candidate.
- Five preferred images selected.
- Single image download validated as an image.
- Preferred ZIP downloaded and parsed with exactly:
  - `01-hero.png`
  - `02-structure.png`
  - `03-function.png`
  - `04-scenario.png`
  - `05-detail.png`
- Non-preferred candidate deletion validated.
- Refresh and application restart recovery validated.
- Test project database rows and storage directory cleanup validated.
- Desktop `1440x900` and mobile `390x844` screenshots captured.

## Evidence Files

- `docs/stages/stage-8/Stage_8_Final_Release_Codex.md`
- `docs/stages/stage-8/UI_ACCEPTANCE.md`
- `docs/stages/stage-8/acceptance-summary.json`
- `docs/stages/stage-8/ui-acceptance/01-home-final.png`
- `docs/stages/stage-8/ui-acceptance/02-create-project.png`
- `docs/stages/stage-8/ui-acceptance/03-reference-upload.png`
- `docs/stages/stage-8/ui-acceptance/04-product-identity.png`
- `docs/stages/stage-8/ui-acceptance/05-five-plans.png`
- `docs/stages/stage-8/ui-acceptance/06-generation-candidate.png`
- `docs/stages/stage-8/ui-acceptance/07-five-preferred.png`
- `docs/stages/stage-8/ui-acceptance/08-zip-export.png`
- `docs/stages/stage-8/ui-acceptance/09-mobile-final.png`
- `docs/stages/stage-8/ui-acceptance/10-startup-doctor.png`
