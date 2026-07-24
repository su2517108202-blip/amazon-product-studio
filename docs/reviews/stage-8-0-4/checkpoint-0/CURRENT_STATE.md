# Current State — Checkpoint 0

## Branch
`review/stage-8-0-4-checkpoint-0-current-state`

## HEAD
`f712e3d3a2511068f7b41afbb72f4fc8ae9e4dd4`

## Stable Baseline
- Tag: `stage-8.0.3-auto-match-drag-drop`
- Commit: `12ae3b1d52d58abe6c6ccc6b993ed5f4252d3fc5`

## Lineage
This branch was created clean from `stage-8.0.3-auto-match-drag-drop` → `codex/stage-8-0-4-minimal-model-discovery`. It does NOT derive from the experimental `codex/stage-8-0-4-full-model-selection` branch.

## Commits on this branch (vs baseline)

```
f712e3d docs: add stage 8.0.4 minimal review documentation
f405db3 refactor: minimal model discovery from official APIs with role model override
12ae3b1 (BASELINE) test: stabilize stage 8.0.3 mobile workspace check
```

## Experimental commits NOT mixed in

| Commit | Description | Status |
|--------|-------------|--------|
| `8b437d2` | fix: enable full model selection | **NOT in this branch** |
| `3f8219a` | fix: use classifyGeminiError | **NOT in this branch** |
| `e5822b7` | refactor: provider accounts and DiscoveredModel | **NOT in this branch** |

All three exist only on `codex/stage-8-0-4-full-model-selection` and `backup/stage-8-0-4-provider-refactor`.

## What has been implemented

- ModelRoleAssignment +modelId +isUserForced (schema only, migration NOT applied)
- /api/provider-models/discover dual-mode endpoint
- roleAcceptanceLevel() with 5-tier classification
- classifyGeminiError deep-parse with 11 error codes
- humanErrorLabel() with Chinese explanations
- buildProviderConfig supports overrides.modelId
- effectiveModelId flows through analyze/generate/generations routes
- analyze route returns diagnostic{} in error responses
- "获取模型列表" button on saved profiles
- Discovered models shown inline with capability tags
- Default project name "未命名项目" (not filename/UUID)
- Name suggestions banner after product analysis
- Diagnostic error display in ProjectStudioClient

## What has NOT been implemented

- Database migration NOT applied (PostgreSQL offline)
- No real Gemini/OpenAI model list call performed
- No real product analysis (商品识别) test
- No real image generation test
- OpenAI error classification not enhanced (still uses generic classifyHttpError)
- No discovered model persistence (in-memory only, lost on refresh)
- No automated CI test execution
- No regression tests run (stage-7, stage-8, stage-8-0-2, stage-8-0-3)
