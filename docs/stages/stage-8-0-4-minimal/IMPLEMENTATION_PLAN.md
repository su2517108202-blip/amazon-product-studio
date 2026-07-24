# Stage 8.0.4 Minimal Model Discovery — Implementation Plan

## Branch
`codex/stage-8-0-4-minimal-model-discovery`

## Baseline
- Tag: `stage-8.0.3-auto-match-drag-drop`
- Commit: `12ae3b1d52d58abe6c6ccc6b993ed5f4252d3fc5`

## Design Constraints
- No DiscoveredModel table — models fetched on-demand, cached in-memory only
- No ProviderProfile semantic changes — modelId stays required
- ModelRoleAssignment: ADD COLUMN modelId + isUserForced only
- Role binding: can override modelId per assignment
- All models must come from official provider APIs

## Files Changed (14)
| File | Change |
|------|--------|
| `prisma/schema.prisma` | ModelRoleAssignment +modelId +isUserForced |
| `prisma/migrations/202607250001_*/migration.sql` | ALTER TABLE ADD COLUMN |
| `src/lib/provider-profiles.js` | roleAcceptanceLevel, ACCEPTANCE_LABELS, GPT-image protocol, sanitizeRoleAssignment with modelId |
| `src/lib/provider-runtime.js` | buildProviderConfig supports overrides.modelId |
| `src/lib/providers/errors.js` | humanErrorLabel, classifyHttpError enhanced |
| `src/lib/providers/gemini.js` | classifyGeminiError deep-parse, throwGeminiError |
| `src/app/api/provider-models/discover/route.js` | Dual-mode: draft form + saved profile |
| `src/app/api/model-role-assignments/[role]/route.js` | Accepts modelId + isUserForced |
| `src/app/api/projects/[projectId]/analyze/route.js` | effectiveModelId, diagnostic errors |
| `src/app/api/.../image-plans/generate/route.js` | effectiveModelId |
| `src/app/api/.../image-plans/[planId]/generations/route.js` | effectiveModelId |
| `src/app/settings/providers/ProviderSettingsClient.js` | Discover button, model list, role model override |
| `src/app/page.js` | Default "未命名项目" |
| `src/app/projects/[projectId]/ProjectStudioClient.js` | Name suggestions, diagnostic error display |
