# Known Issues

## 1. Database Offline
PostgreSQL at `localhost:55432` not accessible during development.
- Cannot apply migration `202607250001`
- Cannot test end-to-end model discovery or product analysis
- **Resolution**: Start PostgreSQL, run `npx prisma migrate deploy`

## 2. OpenAI Adapter Error Classification
OpenAI adapter still uses generic `classifyHttpError(status)` instead of parsing response body for detailed error codes.
- Gemini adapter has full `classifyGeminiError` with body parsing
- OpenAI adapter needs similar treatment for GPT-4/GPT-image specific errors
- **Impact**: OpenAI API errors may still show generic codes

## 3. Discovered Models Not Persisted
Discovered models are stored only in React state (in-memory). Lost on page refresh.
- Deliberate design choice: no DiscoveredModel table
- Model list must be re-fetched after refresh
- **Risk**: If provider API is temporarily unavailable, user cannot see previously discovered models

## 4. Image Generation Reference Image Gate
`MODEL_ROLES.image_generation.accepts` no longer requires `supportsReferenceImagesProfile`, but the generation route still checks it:
- `supportsImageGenerationProfile(profile)` still called before generation
- GPT Image models (openai-images protocol) may fail if reference images are provided
- **Mitigation**: OpenAI adapter warns and skips reference images for openai-images protocol

## 5. Limited Provider Testing
Only Gemini adapter has full error classification. Other adapters (DeepSeek, Doubao) have minimal error handling.
- `classifyHttpError` fallback handles HTTP status codes only
- Provider-specific error bodies not parsed

## 6. No Automated Regression Tests
GitHub Actions CI not configured for stage-8-0-4-minimal branch.
- `test:stage-8-0-4` script exists but requires running database
- Previous stage tests (stage-7, stage-8, stage-8-0-2, stage-8-0-3) not re-run

## 7. ProviderProfile.modelId Still Required
For a true "account-first" flow, modelId should be optional. Currently still required by validation.
- Users must pick a default model when saving a profile
- Model list discovery happens AFTER profile save
- **Workaround**: User can pick any modelId initially, then override via role binding
