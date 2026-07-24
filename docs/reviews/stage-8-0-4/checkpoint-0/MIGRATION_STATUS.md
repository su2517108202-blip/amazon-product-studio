# Migration Status — Checkpoint 0

## Database

- **Host**: `localhost:55432`
- **Status**: **OFFLINE** — `prisma migrate status` returns `P1001: Can't reach database server`
- **Database name**: `amazon_product_studio_stage1`

## Migration Files on Disk

```
prisma/migrations/
├─ 202607230000_stage1_upstream_baseline
├─ 202607230001_stage2_local_projects
├─ 202607230002_stage3_provider_center
├─ 202607230003_stage4_product_analysis
├─ 202607230004_stage5_image_planning
├─ 202607230005_stage6_image_generation
├─ 202607230006_stage6_1_generation_hardening
├─ 202607230007_stage7_result_management
├─ 202607240000_stage7_2_reference_upload_integrity
├─ 202607240002_stage8_0_2_local_usability
└─ 202607250001_stage8_0_4_role_model_id  ← NEW, NOT APPLIED
```

## Migration Execution Status

| Migration | Applied? | When | Notes |
|-----------|----------|------|-------|
| 202607230000 | Cannot verify (DB offline) | — | — |
| ... | Cannot verify | — | — |
| 202607240002 | Cannot verify | — | — |
| **202607250001** | **NOT APPLIED** | Never | DB was offline at commit time |

## Prisma Client State

The Prisma Client was regenerated after schema change (`prisma generate`). It now expects `modelId` and `isUserForced` fields on `ModelRoleAssignment`. If the database has NOT been migrated, queries to `ModelRoleAssignment` will fail with column-not-found errors.

## Experimental Migrations NOT in this Branch

| Migration | Branch | Applied? |
|-----------|--------|----------|
| `202607240003_stage8_0_4_model_selection` | `codex/stage-8-0-4-full-model-selection` only | **NOT in this branch** |
| `202607250000_stage8_0_4_discovered_models` | `codex/stage-8-0-4-full-model-selection` only | **NOT in this branch** |

These exist only in the experimental branch and were never applied to any database.

## Recovery

If database comes online:
```bash
npx prisma migrate deploy
```
This will apply only `202607250001` (safe ALTER TABLE ADD COLUMN).
