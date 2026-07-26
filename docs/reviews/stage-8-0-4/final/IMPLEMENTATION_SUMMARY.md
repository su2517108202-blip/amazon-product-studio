# Stage 8.0.4 Implementation Summary

## Branch
`codex/stage-8-0-4-minimal-model-discovery`

## Baseline
`stage-8.0.3-auto-match-drag-drop` / `12ae3b1d52d58abe6c6ccc6b993ed5f4252d3fc5`

## Final Acceptance And Planned Tag
Final acceptance commit:
`94f7c09adb196f266d0e3df7095d48d654039920`

Planned tag:
`stage-8.0.4-minimal-model-discovery`

Tag must point to:
the final documentation closure commit created by `docs: finalize stage 8.0.4 acceptance records`.

## Scope
Stage 8.0.4 remains a minimal model-discovery and product-vision validation closure.

No architecture rewrite was performed:
- No `ProviderProfile` refactor.
- No `DiscoveredModel` table.
- No new database table.
- No Stage 9 work.
- No paid image generation call.

## Implemented And Verified
1. Official model discovery through provider adapters.
2. Backward-compatible discovery response:
   - `models`: legacy string array.
   - `modelDetails`: enhanced model objects.
3. Gemini official model metadata passthrough in `modelDetails.metadata`:
   - `displayName`
   - `description`
   - `supportedGenerationMethods`
4. Conservative unverified handling for unclear Gemini model capabilities.
5. Role assignment model override with `ModelRoleAssignment.modelId`.
6. Manual role selection tracking with `isUserForced`.
7. Manual forced selection may save an unverified model.
8. Hard conflicts remain blocked:
   - disabled profiles are not allowed;
   - DeepSeek remains blocked for image generation.
9. Runtime product-vision model resolution:
   - `assignment.modelId ?? profile.modelId`.
10. Gemini error classification and redacted diagnostics.
11. Product recognition name suggestions.

## Real Validation Result
- PostgreSQL `localhost:55432` started.
- Migration deploy succeeded.
- Gemini official model discovery returned HTTP 200 and 50 models.
- Real JPG upload returned HTTP 201.
- Real product recognition returned HTTP 200.
- Actual successful model: `gemini-flash-latest`.
- `ProductIdentity` was saved.
- Name suggestions displayed.
- Refresh preserved the saved data.
- Real paid image generation calls: 0.

## Account-Specific Note
`models/gemini-2.5-flash` returned `MODEL_NOT_FOUND` in the current account during product-vision invocation. This is recorded as account-specific evidence, not as a global claim about model availability.
