# Stage 6 Report: BYOK Image Generation Workflow

## 1. Branch, Commit, Tag

- Branch: `codex/stage-6-image-generation`
- Commit: `ef818d0fd063c94d3c1cf251ef4481dd05daaf9c`
- Tag: `stage-6-image-generation`
- Repository: `su2517108202-blip/amazon-product-studio`
- Upstream repository: `SamurAIGPT/amazon-product-studio`

Stage 6 stopped after the real single-image generation workflow. Stage 7 work was not started.

## 2. Stage 5 Document Fix

Updated:

- `STAGE_5_REPORT.md`
- `PROJECT_CONTEXT.md`

Fix:

- Replaced `resolved by stage-5-image-planning` with explicit Stage 5 commit `61549a5`.

## 3. Prisma Models And Migration

New model:

- `ImageGenerationRun`
- `GeneratedImage`

Updated model:

- `ReferenceImage.includeInGeneration`
- `Project.generationRuns`
- `Project.generatedImages`
- `ImagePlan.generationRuns`
- `ImagePlan.generatedImages`

Migration:

- `prisma/migrations/202607230005_stage6_image_generation/migration.sql`

Current database migration:

- `npx prisma migrate dev --config prisma.config.ts` passed.
- `npx prisma generate --config prisma.config.ts` passed.

## 4. Empty Database Migration Chain

Validated on a new temporary PostgreSQL database:

- Created temporary database.
- Ran `npx prisma migrate deploy --config prisma.config.ts`.
- Applied all 6 migrations from stage 1 through stage 6.
- Confirmed `ImageGenerationRun` and `GeneratedImage` tables exist.
- Dropped the temporary database.
- Did not modify the main `amazon_product_studio_stage1` database.

Result:

- Passed.

## 5. API Routes

New routes:

- `POST /api/projects/[projectId]/image-plans/[planId]/generations`
- `GET /api/projects/[projectId]/image-plans/[planId]/generations`
- `GET /api/image-generations/[generationRunId]`
- `POST /api/image-generations/[generationRunId]/check`

Updated routes:

- Reference image upload/update now supports `includeInGeneration`.
- Project duplicate preserves `includeInGeneration`.
- Model role assignment rejects unsupported image generation profiles.

## 6. Provider Adapter And Protocols

Implemented:

- `generateImage(config, input)`
- `checkGeneration(config, task)`

Protocols:

- `gemini-native-image`
- `openai-images`
- `openai-image-edit`
- `doubao-image`
- `generic-async-image`

Provider behavior:

- Gemini uses the native image endpoint documented by Google AI for Gemini image generation: `v1beta/interactions`.
- OpenAI/OpenAI Compatible support synchronous image generation and image edit style requests.
- Generic async is a convention protocol for services that explicitly match the documented submit/check request and response shape.
- DeepSeek is explicitly blocked from `image_generation`.

Reference:

- Official Gemini image generation docs: https://ai.google.dev/gemini-api/docs/image-generation

## 7. Reference Image Rules

Implemented:

- Main reference image always participates.
- Auxiliary references can be selected by the user.
- Maximum generation references: `4`.
- Frontend blocks more than 4.
- Backend also rejects more than 4 with `TOO_MANY_REFERENCE_IMAGES`.
- Local file existence, MIME type, per-file size, and total input size are validated.

## 8. Fingerprint Rules

The generation fingerprint includes:

- Project id
- ProductIdentity updated time and stale state
- ImagePlan id, updated time, final prompt, and stale state
- Reference image ids, file metadata, role, primary flag, and generation flag
- Provider profile id
- Provider
- Model id
- Protocol
- Aspect ratio
- Resolution
- Count

Behavior:

- Same fingerprint plus completed run plus GeneratedImage reuses the existing image.
- Reuse does not create a new run.
- Force regenerate creates a new run and preserves old images.
- Failed run never deletes old images.

## 9. Sync And Async

Synchronous path:

- Creates `ImageGenerationRun`.
- Calls Provider Adapter.
- Saves generated image into local storage.
- Creates `GeneratedImage`.
- Marks run `completed`.

Asynchronous foundation:

- `mode=async` run can store `externalTaskId`.
- `POST /api/image-generations/[generationRunId]/check` checks the original provider/task.
- Completed async result is saved idempotently.
- Completed/failed runs are not resubmitted.

The real Gemini validation used the synchronous path.

## 10. Storage And SSRF Safety

Generated files are stored under:

- `storage/projects/<projectId>/generations/<generationRunId>/<generatedImageId>.<ext>`

Database stores:

- `storageKey`
- MIME
- width and height when detected
- byte size
- SHA-256
- source type

Safety:

- Local absolute paths are not returned by APIs.
- Base64 is not returned by APIs.
- Temporary provider URLs are downloaded and persisted before display.
- Remote URL download blocks non-http(s), redirects, localhost, private IP ranges, and link-local ranges.
- `/api/storage/...` is used for display.

## 11. Real Acceptance

Provider:

- `gemini`

Model:

- `gemini-3.1-flash-image`

Protocol:

- `gemini-native-image`

Project:

- `cmrwl7jxk0000ogpgkfjbah7g`
- `Stage 4 Gemini Acceptance`
- Product: `Matte black stainless steel travel tumbler`

Plan:

- `cmrx9gnek0002oopgdqqpz6xa`
- Plan index: `1`
- Task type: `hero`

Reference image selection:

- Main reference image participated.
- Total references used: `1`

Output:

- Count: `1`
- Resolution: `1K`
- Aspect ratio: `1:1`
- MIME: `image/jpeg`
- Size: `1024x1024`

Completed runs:

- `cmrxbwf860000xwpgko2euzo6`, duration `14857ms`
- `cmrxbxml90001xwpgpygnt5jt`, duration `23582ms`

GeneratedImage records:

- `a081aee6-0880-4f5b-92c0-9e09f3a298d7`
- `ca923359-8ae0-457f-b2d9-473f9cf62d38`

The second completed run came from the required force-regenerate test.

## 12. Reuse, Force, Refresh, Restart

Passed:

- Same fingerprint reused existing completed image.
- Reuse did not create a new run.
- Force regenerate created a new completed run.
- Force regenerate preserved the first generated image.
- Browser opened the project page and found the Stage 6 panel plus latest generated image.
- Service restart preserved the latest generated image via storage API.
- Storage API returned `image/jpeg`.

## 13. Error Tests

Passed:

- Missing `image_generation` binding: `MISSING_IMAGE_GENERATION_PROVIDER`.
- Binding profile without image capability was rejected.
- DeepSeek image-generation binding was rejected.
- Stale ProductIdentity: `STALE_PRODUCT_IDENTITY`.
- Stale ImagePlan: `STALE_IMAGE_PLAN`.
- Empty final prompt: `INVALID_PROMPT`.
- Missing primary reference: `MISSING_PRIMARY_REFERENCE`.
- More than 4 references: `TOO_MANY_REFERENCE_IMAGES`.
- Missing local reference file: `REFERENCE_FILE_NOT_FOUND`.
- Wrong API key: `INVALID_API_KEY`.
- Wrong model: `MODEL_NOT_FOUND`.
- Initial parser mismatch produced failed run without creating GeneratedImage; this was fixed by supporting Gemini `steps[].content[]`.

All failure tests preserved the latest successful GeneratedImage.

## 14. Security Checks

Passed:

- API responses checked for full API key, encrypted key fields, Authorization header, credential key, Base64 payloads, and local absolute paths.
- No leaks found in tested generation, run detail, or provider profile responses.
- Git scan found no real API key. Hits were limited to `.env.example` placeholders and existing source code templates.

Report intentionally excludes:

- Full API key
- Database password
- Credential encryption key
- Authorization header
- Proxy credentials
- Image Base64
- Local absolute image file path

## 15. Verification

Passed:

- `npx prisma migrate dev --config prisma.config.ts`
- `npx prisma generate --config prisma.config.ts`
- Empty DB `npx prisma migrate deploy --config prisma.config.ts`
- `npm run lint`
- `npm run build`

Lint:

- `0` errors
- Existing `6` `<img>` warnings retained

Build:

- Success with Next.js `16.2.6`

## 16. Known Warnings And Risks

Known `<img>` warnings:

- `src/app/gallery/page.js`: 3
- `src/app/page.js`: 1
- `src/app/projects/[projectId]/ProjectStudioClient.js`: 1 existing reference image warning
- `src/components/Navbar.js`: 1

Known npm audit risks:

- Existing `14` npm audit risks remain out of scope.
- `npm audit fix --force` was not run.

## 17. Unresolved Issues

- Stage 7 features are not implemented.
- Full candidate history UI is not implemented.
- Preferred image selection is not implemented.
- Download/ZIP/delete history controls are not implemented.
- Webhook-driven async completion is not implemented.
- ComfyUI, Canva, ChatGPT browser bridge, video, AI model, and batch product generation are not implemented.

## 18. Stage 7 Preconditions

Stage 7 should build on:

- `ImageGenerationRun`
- `GeneratedImage`
- Existing per-plan generation endpoint
- Existing storage security and fingerprint logic

Recommended Stage 7 scope:

- Candidate image history
- Preferred image
- Download/export
- Delete/regenerate management
- Optional async polling UI refinements
