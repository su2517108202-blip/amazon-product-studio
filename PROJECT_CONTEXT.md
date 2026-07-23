# Amazon Product Studio Project Context

## Project

- Repository base: `SamurAIGPT/amazon-product-studio`
- Local path: `F:\codex\amazon-product-studio`
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
| 5 image planning | `codex/stage-5-image-planning` | resolved by `stage-5-image-planning` | `stage-5-image-planning` |

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

## Known Issues

- Existing 6 `<img>` lint warnings remain by instruction.
- Existing npm audit risks remain out of scope.
- Stage 6 image generation, candidates, downloads, webhooks, async polling, ComfyUI, and external editors are not implemented.

## Next Stage Direction

Stage 6 should start from saved `ImagePlan` rows and implement image generation through the `image_generation` provider role. It should preserve stage 5 plans, record generation attempts separately, and never let failed image generation overwrite a plan.
