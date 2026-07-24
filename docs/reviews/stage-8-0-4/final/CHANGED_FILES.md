# Changed Files (21 files, +937/-311)

| # | File | Status | Change |
|---|------|--------|--------|
| 1 | prisma/schema.prisma | M | ModelRoleAssignment +modelId +isUserForced |
| 2 | prisma/migrations/202607250001_*/migration.sql | A | ALTER TABLE ADD COLUMN |
| 3 | src/lib/provider-profiles.js | M | roleAcceptanceLevel, ACCEPTANCE_LABELS, GPT-image protocol, capability inference rules |
| 4 | src/lib/provider-runtime.js | M | buildProviderConfig supports overrides.modelId |
| 5 | src/lib/providers/errors.js | M | humanErrorLabel, classifyHttpError enhanced |
| 6 | src/lib/providers/gemini.js | M | classifyGeminiError, throwGeminiError, safeSummary |
| 7 | src/app/api/provider-models/discover/route.js | M | Dual-mode: draft + saved profile, userId check, capabilityStatus |
| 8 | src/app/api/model-role-assignments/[role]/route.js | M | modelId + isUserForced, effectiveModelId validation |
| 9 | src/app/api/projects/[projectId]/analyze/route.js | M | effectiveModelId, diagnostic errors, completed run in response |
| 10 | src/app/api/.../generate/route.js | M | effectiveModelId through buildProviderConfig |
| 11 | src/app/api/.../generations/route.js | M | effectiveModelId through buildProviderConfig |
| 12 | src/app/page.js | M | Default "未命名项目" |
| 13 | src/app/projects/[projectId]/ProjectStudioClient.js | M | Name suggestions, diagnostic error display |
| 14 | src/app/settings/providers/ProviderSettingsClient.js | M | Model discovery buttons, role dropdown with discovered models |
| 15 | scripts/stage-8-0-4-checkpoint-0-1-tests.mjs | A | 25 static unit tests |
| 16-21 | docs/stages/stage-8-0-4-minimal/* | A | Stage documentation |

## No data structure changes beyond ADD COLUMN
- ProviderProfile.modelId: still required String
- No DiscoveredModel table
- No column renames or deletions
