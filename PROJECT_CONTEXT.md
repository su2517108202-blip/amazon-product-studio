# Amazon Product Studio Project Context

## Project

- Repository: `su2517108202-blip/amazon-product-studio`
- Upstream repository: `SamurAIGPT/amazon-product-studio`
- Local path: not recorded in repository documents
- Local URL: `http://localhost:3000`
- Database: `amazon_product_studio_stage1`
- PostgreSQL: local portable database on port `55432`

## Completed Stages

| Stage | Branch | Implementation Commit | Seal Tag | Seal Tag Target |
| --- | --- | --- | --- | --- |
| 1 upstream baseline | `codex/stage-1-original-run` | `bc6355f` | `stage-1-original-run` | `bc6355f` |
| 2 local projects | `codex/stage-2-local-projects` | `040b11c` | `stage-2-local-projects` | `040b11c` |
| 3 BYOK provider center | `codex/stage-3-provider-center` | `7a942cd` | `stage-3-provider-center` | `7a942cd` |
| 4 product analysis | `codex/stage-4-product-analysis` | `7b18db6` | `stage-4-product-analysis` | `7b18db6` |
| 5 image planning | `codex/stage-5-image-planning` | `61549a5` | `stage-5-image-planning` | `61549a5` |
| 6 image generation | `codex/stage-6-image-generation` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` | `stage-6-image-generation` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` |
| 6.1 generation hardening | `codex/stage-6-1-hardening` | `04bc277be6442578fd5d4c31e73349faecdb2c82` | `stage-6-1-hardening` | `3b1b119ff89dca74a68433fe85b9981745e5baa8` |
| 6.2 async auth CI fix | `codex/stage-6-2-auth-ci-fix` | `c69a302bb6bd581e49c6f4e838fb81711e53943d` | `stage-6-2-auth-ci-fix` | Reported in final reply |
| 7 result management | `codex/stage-7-result-management` | `0ff10b893309bffa6e3c3688838fb7bdf43f33d1` | `stage-7-result-management` | Reported in final reply |
| 7.1 CN upload fix | `codex/stage-7-1-cn-upload-fix` | Reported in final reply | `stage-7-1-cn-upload-fix` | Reported in final reply |

## Current Prisma Models

- `User`
- `Account`
- `Session`
- `VerificationToken`
- `AmazonProductCreation`
- `Project`
- `ReferenceImage`
- `ProductIdentity`
- `ProductAnalysisRun`
- `ProviderProfile`
- `ModelRoleAssignment`
- `ImagePlan`
- `ImagePlanningRun`
- `ImageGenerationRun`
- `GeneratedImage`

## Current Provider Support

Provider profiles are managed through BYOK settings with encrypted API key storage.

Supported providers:

- OpenAI
- Gemini
- DeepSeek
- Doubao / Volcengine Ark
- OpenAI Compatible

Current model roles:

- `product_vision`
- `image_planning`
- `image_generation`

Stage 5 uses `image_planning` and requires `text` capability.
Stage 6 uses `image_generation` and requires `image` or `asyncImage` capability plus a protocol that truly transmits reference images.
Stage 7 manages saved generated results and does not require new provider calls for history, preferred selection, downloads, or ZIP export.

## Stage 5 Completion

Stage 5 adds a five-image ecommerce planning workflow:

- One text-model call returns exactly 5 structured plans.
- Plans are saved as separate `ImagePlan` rows.
- Generation history is saved as `ImagePlanningRun`.
- Existing plans are reused when input fingerprint matches.
- Failed generation does not overwrite successful plans.
- ProductIdentity and project input changes mark plans stale.
- Users can edit each plan and recover it after refresh or service restart.
- No image generation work was started.

Real planning validation:

- Provider: `gemini`
- Model: `gemini-flash-latest`
- Project: `Stage 4 Gemini Acceptance`
- Product: `Matte black stainless steel travel tumbler`
- Result: 5 saved plans and completed `ImagePlanningRun`

## Stage 6 Completion

Stage 6 adds the real single-image generation loop:

- One selected `ImagePlan` generates one real image.
- Image generation uses the `image_generation` role.
- `ImageGenerationRun` records success and failure attempts.
- `GeneratedImage` stores the local persisted result metadata.
- Generated images are saved under project storage and served through `/api/storage/...`.
- Same fingerprint reuses existing successful images without a new provider call.
- Force regeneration creates a new run and preserves old images.
- Failed generation does not delete old images or change `ImagePlan.finalPrompt`.
- Studio shows the current plan's latest successful generated image.
- Stage 7 candidate history, preferred image, downloads, and version management are not implemented.
- Stage 6.1 later hardens storage access, async idempotency, protocol honesty, and CI without adding Stage 7 features.

Real image validation:

- Provider: `gemini`
- Model: `gemini-3.1-flash-image`
- Protocol: `gemini-native-image`
- Project: `Stage 4 Gemini Acceptance`
- Plan: image plan 1 / `hero`
- Result: 1K `1024x1024` JPEG saved locally and restored after service restart.

## Stage 6.1 Completion

Stage 6.1 hardens the Stage 6 generation workflow:

- Gemini requests no longer put API keys in URL query parameters.
- Storage serving requires the current user, project ownership, and a matching reference/generated image database record.
- Storage path resolution rejects traversal and sibling-prefix paths.
- `GeneratedImage.outputIndex` and a unique run/index constraint make async completion idempotent.
- Async runs track check attempts, last checked time, and expiration.
- Expired and terminal async failures are persisted as `failed`; transient network failures stay `processing`.
- Image generation role binding and execution now require a protocol that truly supports reference images.
- Generic async is documented as a convention protocol, not a universal standard.
- GitHub Actions CI was added for install, Prisma generate, migration deploy, Stage 6.1 checks, lint, and build.

Stage 6.1 did not add candidate history, preferred image selection, download, ZIP, batch generation, or other Stage 7 features.

## Stage 6.2 Completion

Stage 6.2 is a final Stage 6 hardening fix:

- Async generation checks no longer read or mutate runs in `catch` by id alone.
- Unauthenticated async checks return 401 without querying runs or calling upstream providers.
- Cross-user async checks return a safe not-found style response without leaking provider, model, or external task details.
- Owned processing async checks continue to work.
- Completed and failed runs still short-circuit without provider calls.
- Runtime auth tests now exercise the real API route through temporary Next servers and a local fake provider.
- CI now triggers on `codex/**`, `main`, and pull requests, and runs Stage 6.1 plus Stage 6.2 checks.

Stage 6.2 did not add candidate history, preferred image selection, download, ZIP, batch generation, or other Stage 7 features.

## Stage 7 Completion

Stage 7 adds generated result management:

- Each `ImagePlan` now has a visible generated-image candidate history.
- A single preferred generated image can be set, replaced, cleared, and restored per plan.
- Preferred state persists after refresh and service restart.
- Non-preferred generated images can be soft-deleted with confirmation.
- Preferred generated images cannot be directly deleted.
- Single-image download returns a safe filename and correct MIME.
- A five-image preferred ZIP export is enabled only at `5/5` preferred completion.
- The ZIP export contains exactly 5 preferred images in plan order.
- Deleted generated images are excluded from history, storage serving, reuse, and async check responses.
- Forced generation attempts are tracked with `ImageGenerationRun.isForcedVersion`.

Stage 7 database additions:

- `ImagePlan.preferredGeneratedImageId`
- `GeneratedImage.deletedAt`
- `ImageGenerationRun.isForcedVersion`
- Preferred-image relation between `ImagePlan` and `GeneratedImage`

Stage 7 real UI acceptance:

- Project list, provider settings, and project studio were opened in browser.
- Desktop `1440x900` and mobile `390x844` were checked.
- Screenshots are stored under `docs/stages/stage-7/ui-acceptance/`.
- UI acceptance details are stored in `docs/stages/stage-7/UI_ACCEPTANCE.md`.
- Sanitized machine-readable acceptance is stored in `docs/stages/stage-7/acceptance-summary.json`.
- No new paid upstream image generation calls occurred during UI acceptance.

Stage 7 did not add Stage 8 features, external editors, webhooks, ComfyUI, or automatic paid batch generation.

## Stage 7.1 Completion

Stage 7.1 keeps Stage 7 result management intact and adds Chinese localization, upload hardening, and global readability improvements:

- User-facing UI copy is simplified Chinese across the project list, project creation, project studio, provider settings, product recognition, product identity, five-image planning, image generation, candidate history, preferred image management, download, ZIP export, loading, success, failure, empty, confirmation, and mobile states.
- Product recognition, five-image planning, and final image-generation prompts now require simplified Chinese natural-language output while preserving required English JSON field names.
- Chinese-output guards reject mostly English product identity or five-image planning payloads in Chinese workflows.
- Reference-image upload now enforces a 12MB per-image limit and only allows JPEG, PNG, and WebP with matching content signatures.
- Empty files, non-images, MIME/signature mismatches, oversized files, over-limit uploads, and invalid mixed batches are rejected with Chinese errors.
- Batch upload validation is atomic and cleans saved files if a later write fails.
- Upload responses do not expose local absolute paths, raw system errors, secrets, headers, image Base64, or storage internals.
- The first reference image still becomes the primary reference automatically.
- Global Chinese font stack and readable desktop/mobile text rules were added.
- `text-[10px]`, `text-[9px]`, `text-[11px]`, and excessive `font-black` usage were removed from main app source.

Stage 7.1 real UI acceptance:

- Actual routes visited: `/`, `/settings/providers`, `/projects/cmrxtauxc000u3opgnmbeixjs`.
- Desktop `1440x900` and mobile `390x844` were checked.
- Screenshots are stored under `docs/stages/stage-7-1/ui-acceptance/`.
- UI acceptance details are stored in `docs/stages/stage-7-1/UI_ACCEPTANCE.md`.
- Sanitized machine-readable acceptance is stored in `docs/stages/stage-7-1/acceptance-summary.json`.
- Real Gemini product recognition and five-image planning were completed on a new Chinese test project.
- No new paid upstream image-generation call occurred during Stage 7.1 acceptance.

Stage 7.1 did not add Stage 8 features, automatic batch generation, external editors, webhooks, or ComfyUI.

## Stage 7.2 Completion

Stage 7.2 remediates the blocking findings from the pre-Stage-8 full repository audit while keeping Stage 8 unopened:

- Project-studio mojibake was repaired and guarded with a UI text scan.
- Remaining user-facing English labels from the home page and navigation were localized.
- Reference-image storage names now use collision-resistant UUIDs instead of `Date.now()`.
- Reference-image extensions are generated from detected MIME.
- JPEG, PNG, and WebP uploads now require successful image decoding, not just matching magic bytes.
- Reference-image batch uploads are serialized per project with PostgreSQL advisory locks.
- The 14-image project limit is enforced inside the locked transaction.
- Concurrent first uploads now leave exactly one primary reference image.
- A database migration adds a partial unique index for one primary reference image per project.
- The local-mode legacy MUAPI upload route now returns a safe disabled response.
- Provider profiles expose explicit reference-image support status.
- Candidate history supports paginated loading without duplicate candidates.
- Production `npm audit --omit=dev` critical and high counts are both zero.

Stage 7.2 evidence:

- Stage report: `docs/stages/stage-7-2/STAGE_7_2_REPORT.md`
- UI report: `docs/stages/stage-7-2/UI_ACCEPTANCE.md`
- Acceptance summary: `docs/stages/stage-7-2/acceptance-summary.json`
- UI screenshots: `docs/stages/stage-7-2/ui-acceptance/`
- Instruction source: `docs/stages/stage-7-2/Stage_7_2_Pre_Stage_8_Remediation_Codex.md`

## Stage 7.2.1 Final Closure

Stage 7.2.1 closes the remaining pre-Stage-8 verification gaps without starting Stage 8:

- GitHub Actions now includes Stage 7.2 remediation tests, UI text checks, Stage 7.2.1 Playwright upload E2E, and production high-level audit.
- Reference upload validation now forces full pixel decode with `sharp(...).rotate().raw().toBuffer()` after MIME and metadata checks.
- The reference-image decode limit is capped at `25,000,000` pixels.
- Real middle-corrupted PNG, JPEG, and WebP samples are rejected with `INVALID_IMAGE_CONTENT`.
- Project studio typography no longer uses readable `text-[10px]` or excessive `font-black`.
- The reference-image file selector no longer offers GIF and only lists JPG, PNG, and WebP.
- Candidate pagination now uses `limit + 1` terminal-page detection.
- Reference-image primary switching is protected by a project-scoped advisory lock and transaction.
- Playwright verified real `<input type="file">` upload of JPG, PNG, and WebP, one upload POST, thumbnail display, first-primary behavior, refresh recovery, and mobile readability.

Stage 7.2.1 evidence:

- Stage report: `docs/stages/stage-7-2-1/STAGE_7_2_1_REPORT.md`
- UI report: `docs/stages/stage-7-2-1/UI_ACCEPTANCE.md`
- Acceptance summary: `docs/stages/stage-7-2-1/acceptance-summary.json`
- UI screenshots: `docs/stages/stage-7-2-1/ui-acceptance/`
- Instruction source: `docs/stages/stage-7-2-1/Stage_7_2_1_Final_Closure_Codex.md`

## Known Issues

- Existing 6 `<img>` lint warnings remain by instruction.
- `npm audit --omit=dev` still reports three moderate development-chain advisories through Prisma CLI dependencies; production critical and high counts are zero.
- Webhooks, ComfyUI, external editors, and Stage 8 workflows are not implemented.

## Next Stage Direction

Stage 8 should build on Stage 7.2. Candidate history, preferred selection, single download, preferred ZIP export, safe version management, Chinese UX copy, upload validation, upload concurrency protection, Provider reference-image capability, candidate pagination, and readable typography are now implemented and should be preserved.
