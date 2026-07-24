# Changed Files — Checkpoint 0

All changes relative to baseline `stage-8.0.3-auto-match-drag-drop` (12ae3b1d).

| # | File | Status | Reason | Data Structure Change? | Profile Semantic Change? |
|---|------|--------|--------|------------------------|--------------------------|
| 1 | `prisma/schema.prisma` | M | ModelRoleAssignment +2 columns | Yes — ADD COLUMN modelId, isUserForced | No — ProviderProfile unchanged |
| 2 | `prisma/migrations/202607250001_*/migration.sql` | A | New migration (NOT applied) | Yes — ALTER TABLE ADD COLUMN | No |
| 3 | `src/lib/provider-profiles.js` | M | roleAcceptanceLevel, ACCEPTANCE_LABELS, GPT-image protocol, sanitizeRoleAssignment | No | No |
| 4 | `src/lib/provider-runtime.js` | M | buildProviderConfig supports overrides.modelId | No | No |
| 5 | `src/lib/providers/errors.js` | M | humanErrorLabel, enhanced classifyHttpError | No | No |
| 6 | `src/lib/providers/gemini.js` | M | classifyGeminiError deep-parse, throwGeminiError | No | No |
| 7 | `src/app/api/provider-models/discover/route.js` | M | Dual-mode: draft form + saved profile | No | No |
| 8 | `src/app/api/model-role-assignments/[role]/route.js` | M | Accepts modelId + isUserForced in PUT | No | No |
| 9 | `src/app/api/projects/[projectId]/analyze/route.js` | M | effectiveModelId, diagnostic error response | No | No |
| 10 | `src/app/api/.../image-plans/generate/route.js` | M | effectiveModelId through buildProviderConfig | No | No |
| 11 | `src/app/api/.../image-plans/[planId]/generations/route.js` | M | effectiveModelId through buildProviderConfig | No | No |
| 12 | `src/app/page.js` | M | Default name "未命名项目" | No | No |
| 13 | `src/app/projects/[projectId]/ProjectStudioClient.js` | M | Name suggestions, diagnostic error display | No | No |
| 14 | `src/app/settings/providers/ProviderSettingsClient.js` | M | Discover button, model list, role model override | No | No |

## Documentation Files (new)

| # | File | Status |
|---|------|--------|
| 15 | `docs/stages/stage-8-0-4-minimal/IMPLEMENTATION_PLAN.md` | A |
| 16 | `docs/stages/stage-8-0-4-minimal/MODEL_DISCOVERY_DESIGN.md` | A |
| 17 | `docs/stages/stage-8-0-4-minimal/PRODUCT_VISION_ACCEPTANCE.md` | A |
| 18 | `docs/stages/stage-8-0-4-minimal/MIGRATION_NOTES.md` | A |
| 19 | `docs/stages/stage-8-0-4-minimal/acceptance-summary.json` | A |
| 20 | `docs/stages/stage-8-0-4-minimal/KNOWN_ISSUES.md` | A |

## Assessment

- **ProviderProfile semantic**: UNCHANGED — modelId still required, same fields, same meaning
- **Data structure change**: Additive only — ModelRoleAssignment gains 2 nullable columns
- **No DiscoveredModel**: Confirmed — schema contains no such table
- **No experimental migration residues**: `202607240003` and `202607250000` do NOT exist in this branch
