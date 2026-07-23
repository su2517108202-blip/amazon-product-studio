# Stage 6.1 Report: Image Generation Hardening

## Branch, Implementation Commit, Seal Tag

- Branch: `codex/stage-6-1-hardening`
- Implementation commit: `04bc277be6442578fd5d4c31e73349faecdb2c82`
- Seal tag: `stage-6-1-hardening`
- Seal tag target: `3b1b119ff89dca74a68433fe85b9981745e5baa8`
- Repository: `su2517108202-blip/amazon-product-studio`
- Upstream repository: `SamurAIGPT/amazon-product-studio`

Stage 6.1 only hardens Stage 6 image generation safety, async idempotency, storage authorization, and reference-image protocol honesty. Stage 7 work was not started.

## Fixes

- Gemini API key moved from URL query parameters to the `x-goog-api-key` header for connection tests, model listing, product analysis, image planning, and image generation.
- Storage path resolution now uses `path.relative()` boundary checks and rejects encoded traversal, separator injection, and sibling-prefix paths.
- `/api/storage/...` now requires the current user, verifies project ownership, and checks matching `ReferenceImage.storageKey` or `GeneratedImage.storageKey`.
- `GeneratedImage.outputIndex` was added with `@@unique([generationRunId, outputIndex])`.
- Generated image persistence now handles concurrent completion with unique-conflict recovery and cleanup of duplicate files.
- Async runs now track `checkAttempts`, `lastCheckedAt`, and `expiresAt`.
- Expired async runs become `failed` with `ASYNC_TASK_EXPIRED`.
- Terminal async errors become `failed`; transient network errors remain `processing` with a safe summary.
- Completed and failed async runs no longer call upstream providers during checks.
- Provider profiles now expose `supportsReferenceImages`; default ecommerce image generation only accepts protocols that truly transmit reference images.
- `openai-images`, `doubao-image`, and current `generic-async-image` are blocked from the default reference-image workflow.
- `generic-async-image` is marked as a convention protocol and validates explicit response schema.
- GitHub Actions CI was added.

## Migration

- Added `prisma/migrations/202607230006_stage6_1_generation_hardening/migration.sql`.
- Local database migration: passed.
- Prisma generate: passed.
- Empty database full migration chain: passed with all seven migrations.

## Storage Tests

- Normal generated image read: passed.
- Other-project storage URL denied: passed.
- Encoded traversal denied: passed.
- Sibling-prefix traversal denied: passed.
- Storage errors did not include local absolute paths: passed.
- Non-local unauthenticated access is guarded by `requireCurrentUser()`; local mode continues to resolve the default local user.

## Async Tests

- Two concurrent async checks for the same completed task produced one `GeneratedImage` row at `outputIndex=0`.
- Async expiration changed the run to `failed` with `ASYNC_TASK_EXPIRED`.
- Terminal provider failure changed the run to `failed` with the provider error code.
- Temporary network failure kept the run `processing`, recorded `NETWORK_ERROR`, and did not create a new run.
- Completed and failed runs skipped upstream checks on later polling.

## Provider Reference Image Matrix

| Provider | Protocol | supportsReferenceImages | Default ecommerce generation |
| --- | --- | --- | --- |
| Gemini | `gemini-native-image` | true | allowed |
| OpenAI | `openai-image-edit` | true | allowed |
| OpenAI | `openai-images` | false | blocked |
| OpenAI Compatible | `openai-image-edit` | true | allowed |
| OpenAI Compatible | `openai-images` | false | blocked |
| OpenAI Compatible | `generic-async-image` | false in current implementation | blocked |
| Doubao | `doubao-image` | false in current implementation | blocked |
| DeepSeek | any image protocol | false | blocked |

`generic-async-image` is only a convention protocol. It requires explicit `externalTaskId` on submit, explicit `processing` / `completed` / `failed` status on check, and an actual image for completed responses.

## Gemini Regression

- Provider: `gemini`
- Model: `gemini-3.1-flash-image`
- Protocol: `gemini-native-image`
- Real single-image generation: passed.
- Run status: `completed`.
- Output index: `0`.
- Output MIME: `image/jpeg`.
- Output size: `1024x1024`.

## Verification

- `npm run test:stage-6-1`: passed.
- `npx prisma generate --config prisma.config.ts`: passed.
- `npx prisma migrate dev --config prisma.config.ts`: passed.
- Empty database `npx prisma migrate deploy --config prisma.config.ts`: passed.
- `npm run lint`: passed with existing 6 `<img>` warnings.
- `npm run build`: passed.
- GitHub Actions: configured; final pushed-branch result is checked after push.

## Unresolved Issues

- Stage 7 candidate history, preferred image, download, ZIP, delete history, batch generation, Canva, ComfyUI, video, and AI model features remain out of scope.
- Non-local unauthenticated storage behavior is enforced by the route guard but was not exercised with a separate auth-mode server in this run.
