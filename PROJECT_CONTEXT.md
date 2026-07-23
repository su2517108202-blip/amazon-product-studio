# Amazon Product Studio Project Context

## Project

- Repository: `su2517108202-blip/amazon-product-studio`
- Upstream repository: `SamurAIGPT/amazon-product-studio`
- Local path: not recorded in repository documents
- Local URL: `http://localhost:3000`
- Database: `amazon_product_studio_stage1`
- PostgreSQL: local portable database on port `55432`

## Completed Stages

| Stage | Branch | Commit | Tag |
| --- | --- | --- | --- |
| 1 upstream baseline | `codex/stage-1-original-run` | `bc6355f` | `stage-1-original-run` |
| 2 local projects | `codex/stage-2-local-projects` | `040b11c` | `stage-2-local-projects` |
| 3 BYOK provider center | `codex/stage-3-provider-center` | `7a942cd` | `stage-3-provider-center` |
| 4 product analysis | `codex/stage-4-product-analysis` | `7b18db6` | `stage-4-product-analysis` |
| 5 image planning | `codex/stage-5-image-planning` | `61549a5` | `stage-5-image-planning` |
| 6 image generation | `codex/stage-6-image-generation` | `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c` | `stage-6-image-generation` |
| 6.1 generation hardening | `codex/stage-6-1-hardening` | `04bc277be6442578fd5d4c31e73349faecdb2c82` | `stage-6-1-hardening` |

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

## Known Issues

- Existing 6 `<img>` lint warnings remain by instruction.
- Existing npm audit risks remain out of scope.
- Stage 7 candidate history, downloads, webhooks, ComfyUI, and external editors are not implemented.

## Next Stage Direction

Stage 7 should start from saved `GeneratedImage` records and implement candidate history, preferred image selection, downloads/exports, and image version management. It should preserve Stage 6 run/image records and never let failed generation delete successful images.
