# Stage 5 Report: Five-Image Ecommerce Planning Workflow

## 1. Baseline

- Branch: `codex/stage-5-image-planning`
- Stage 5 commit SHA: resolved by tag `stage-5-image-planning` after sealing.
- Stage 5 Git tag: `stage-5-image-planning`
- Project path: `F:\codex\amazon-product-studio`
- Local URL: `http://localhost:3000`
- Database: `amazon_product_studio_stage1` on local PostgreSQL port `55432`

## 2. Prisma Changes

New models:

- `ImagePlan`
- `ImagePlanningRun`

Migration files:

- `prisma/migrations/202607230000_stage1_upstream_baseline/migration.sql`
- `prisma/migrations/202607230004_stage5_image_planning/migration.sql`

The stage 1 upstream baseline migration was added because the previous migration directory began at stage 2 while the local database already contained the upstream Auth and legacy creation tables. All existing migrations were marked as applied, then `npx prisma migrate dev --config prisma.config.ts` completed with "Already in sync".

## 3. API Routes

New routes:

- `GET /api/projects/[projectId]/image-plans`
- `POST /api/projects/[projectId]/image-plans/generate`
- `GET /api/projects/[projectId]/image-planning-runs`
- `PATCH /api/projects/[projectId]/image-plans/[planId]`

Existing routes updated:

- Project list/detail now include image planning summaries.
- Product identity save and successful product analysis mark image plans stale.
- Project field changes for name, product name, platform, aspect ratio, and notes mark image plans stale.

## 4. Provider Adapter Changes

Implemented `createImagePlan(config, input)` for:

- OpenAI
- Gemini
- DeepSeek
- Doubao / Volcengine Ark
- OpenAI Compatible

The route uses the `image_planning` role binding, requires `text` capability, decrypts API keys only on the server, and preserves the existing provider proxy behavior. No image generation API is called in stage 5.

## 5. Five-Plan Structure

The model must return exactly 5 plans:

1. `hero`
2. `structure`
3. `function`
4. `scenario`
5. `detail`

Each `ImagePlan` is saved as a separate database row with its own `planIndex`, task fields, arrays, `finalPrompt`, source provider/model metadata, `inputFingerprint`, `isManuallyEdited`, and `isStale`.

## 6. JSON Validation

Validated locally:

- Valid strict JSON array
- Markdown-wrapped JSON array
- Non-JSON response rejected as `INVALID_MODEL_RESPONSE`
- Fewer than 5 items rejected
- More than 5 items rejected
- Duplicate index rejected
- Wrong task type rejected
- HTML rejected
- Script content rejected

Invalid model output is not saved to `ImagePlan`.

## 7. inputFingerprint And Stale Rules

The planning fingerprint includes:

- Project id, name, product name, platform, aspect ratio, notes
- ProductIdentity updated time, stale state, and core identity fields
- Provider profile id and model id

Rules:

- Matching fingerprint plus a complete non-stale 5-plan set reuses existing plans without another upstream call.
- ProductIdentity edits mark existing plans stale.
- Successful product re-analysis marks existing plans stale.
- Project name, product name, platform, aspect ratio, or notes edits mark existing plans stale.
- Stale ProductIdentity blocks generation unless explicitly allowed.
- Failed generation never deletes or overwrites existing successful plans.

## 8. Frontend Changes

Updated project studio with:

- Current planning model/provider state
- Identity and planning status
- Generate/regenerate action
- Confirm dialog before overwriting existing plans
- Warning when overwriting manual edits
- Five horizontal plan tabs
- Editable fields for core selling point, scene, composition, titles, notes, must-keep, avoid, and final prompt
- Unsaved-change warning on tab switch
- Manual edit persistence
- Disabled stage 6 placeholder: image generation is not active in this stage

Updated homepage project cards with:

- `主图策划：0/5`
- `主图策划：5/5`
- `主图策划：需更新`

## 9. Real Provider Acceptance

Provider:

- `gemini`

Model:

- `gemini-flash-latest`

Validation project:

- Project id: `cmrwl7jxk0000ogpgkfjbah7g`
- Project name: `Stage 4 Gemini Acceptance`
- Product: `Matte black stainless steel travel tumbler`
- Platform: `Amazon`
- Aspect ratio: `1:1`

Actual upstream planning attempts:

- Completed run `cmrx9g4690001oopgzwo6e01n`, duration `25094ms`
- Failed wrong-key run `cmrx9o6e30000q0pgfnw22aid`, duration `972ms`, error code `UPSTREAM_ERROR`
- Completed regenerate run `cmrx9tllg0002q0pg76p2kgr5`, duration `26172ms`

Reuse checks did not create new `ImagePlanningRun` rows and did not call the upstream model.

## 10. Database Results

Final `ImagePlan` count for the validation project:

- `5`

Final plan rows:

- 1 `hero`: `质感哑光随行杯`
- 2 `structure`: `精工直筒杯身结构`
- 3 `function`: `便捷推拉式开合`
- 4 `scenario`: `日常随行 随时补水`
- 5 `detail`: `精致标识 哑光磨砂`

Final plan state:

- `isStale=false` for all 5 final rows
- `sourceProvider=gemini`
- `sourceModel=gemini-flash-latest`

Final `ImagePlanningRun` counts for the validation project:

- Completed: `2`
- Failed: `1`

## 11. Manual Edit And Recovery Tests

Passed:

- Manual edit saved through `PATCH /api/projects/[projectId]/image-plans/[planId]`
- Edited plan was marked `isManuallyEdited=true`
- Page/API refresh restored the edited value
- Service restart restored all 5 plans from PostgreSQL

The final regenerate test intentionally overwrote the temporary manual edit after a successful provider response.

## 12. Error Tests

Passed:

- Wrong API key created a failed `ImagePlanningRun`
- Wrong-key failure did not overwrite the existing 5 plans
- Stale ProductIdentity returned `409` before any upstream planning run was created
- JSON validation failures return `INVALID_MODEL_RESPONSE` and do not save incomplete plans

## 13. Security Checks

Passed:

- No full API key in Git-tracked files
- No full API key in tested API responses
- No encrypted API key fields in tested browser responses
- No Authorization header in tested browser responses
- Reports do not include full API keys, database password, credential encryption key, proxy credentials, or image Base64

Allowed:

- Provider settings may expose masked key state/last-four style metadata from the existing provider center.

## 14. Verification Commands

Passed:

- `npx prisma migrate dev --config prisma.config.ts`
- `npx prisma generate --config prisma.config.ts`
- `npm run lint`
- `npm run build`

Lint result:

- `0` errors
- `6` existing `<img>` warnings

Build result:

- Success with Next.js `16.2.6`

## 15. Known Warnings And Risks

Known `<img>` warnings retained by instruction:

- `src/app/gallery/page.js`: 3 warnings
- `src/app/page.js`: 1 warning
- `src/app/projects/[projectId]/ProjectStudioClient.js`: 1 warning
- `src/components/Navbar.js`: 1 warning

Known npm audit risks:

- Existing `14` npm audit risks remain out of scope for stage 5.
- `npm audit fix --force` was not run.

## 16. Main Modified Files

- `prisma/schema.prisma`
- `prisma/migrations/202607230000_stage1_upstream_baseline/migration.sql`
- `prisma/migrations/202607230004_stage5_image_planning/migration.sql`
- `src/lib/image-planning.js`
- `src/lib/providers/openai.js`
- `src/lib/providers/gemini.js`
- `src/lib/providers/openai-compatible.js`
- `src/lib/providers/deepseek.js`
- `src/lib/providers/doubao.js`
- `src/app/api/projects/[projectId]/image-plans/route.js`
- `src/app/api/projects/[projectId]/image-plans/generate/route.js`
- `src/app/api/projects/[projectId]/image-planning-runs/route.js`
- `src/app/api/projects/[projectId]/image-plans/[planId]/route.js`
- `src/app/projects/[projectId]/ProjectStudioClient.js`
- `src/app/page.js`
- `src/lib/projects.js`

## 17. Unresolved Issues

- No stage 6 image generation, image candidates, downloads, webhooks, async polling, or ComfyUI work was started.
- Existing `<img>` warnings are intentionally retained.
- Existing npm audit risks are intentionally retained.

## 18. Stage 6 Preconditions

Before stage 6:

- Use existing `ImagePlan` rows as immutable planning inputs.
- Add image generation tasks/candidates without changing the stage 5 plan schema unless needed.
- Keep provider role separation: stage 6 must use `image_generation`, not `image_planning`.
- Do not overwrite `ImagePlan.finalPrompt` from failed image generation attempts.
