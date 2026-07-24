# Stage 8.0.4 Implementation Summary

## Branch
`codex/stage-8-0-4-minimal-model-discovery`

## Baseline
`stage-8.0.3-auto-match-drag-drop` / `12ae3b1d52d58abe6c6ccc6b993ed5f4252d3fc5`

## Architecture
No architecture refactor. No DiscoveredModel table. No ProviderProfile semantic change.
ProviderProfile = existing model (modelId required, same fields).
ModelRoleAssignment gains 2 nullable columns only.

## What was implemented
1. Official API model discovery via provider adapters (GET /v1/models, GET /v1beta/models)
2. All models displayed - no hidden models, no hardcoded names
3. 5-tier capability status: official/adapterVerified/inferred/unverified/unsupported
4. Three-role independent model override via ModelRoleAssignment.modelId
5. isUserForced tracking (manual=true, auto=false)
6. Runtime chain: effectiveModelId = assignment.modelId ?? profile.modelId
7. Gemini error classification with 11 specific error codes
8. Sanitized diagnostic chain (adapter → route → frontend)
9. Name suggestions after product analysis
10. Default "未命名项目" naming
11. All text sizes ≥ 12px

## What was NOT implemented
- Real product recognition (PostgreSQL not available)
- GPT image generation testing
- OpenAI error body classification
