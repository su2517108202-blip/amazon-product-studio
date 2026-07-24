# Checkpoint 0.1 Fixes

## Applied Fixes

| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| 1 | Duplicate `discoverModels` | Renamed to `discoverDraftModels` + `discoverSavedProfileModels` | ProviderSettingsClient.js |
| 2 | Model data structure | Unified `{modelId, capabilities, protocol, capabilityStatus, reason}`. All select keys/values use `model.modelId`. No `toLowerCase` on objects. | discover/route.js, ProviderSettingsClient.js |
| 3 | Role model override | Dropdown selects from discovered models using `ppId::modelId`. assignRole passes modelId. `current.modelId` displayed with override status. | ProviderSettingsClient.js |
| 4 | isUserForced semantics | Manual select → `isUserForced: true` (via `!lockedRoles[role]`). Auto-recommend → `false`. Locked roles skip auto-recommend. | ProviderSettingsClient.js |
| 5 | Server-side role validation | Re-infers `inferModelCapabilities(provider, effectiveModelId)` before `roleAcceptanceLevel` check. | [role]/route.js |
| 6 | Cross-user profileId | discover endpoint adds `userId: user.id` to profile lookup. | discover/route.js |
| 7 | Gemini fake vision | `inferModelCapabilities` now excludes `embedding-*` and `aqa` models. Unknown models marked `capabilityStatus: "unverified"`. | provider-profiles.js, discover/route.js |
| 8 | Gemini error cause | `throwGeminiError` creates `safeSummary` (httpStatus, errorStatus, errorMessage only). Raw body never attached. | gemini.js |
| 9 | analyze success response | Returns `runToResponse(updatedRun)` (completed), not original `run` (processing). | analyze/route.js |
| 10 | GPT image claim | Not claimed fixed. Known conflict: `gpt-image → openai-images → no reference images`. | provider-profiles.js (unchanged) |
| 11 | Text readability | `text-[10px]` and `text-[11px]` replaced with `text-xs` (12px). | ProviderSettingsClient.js |
