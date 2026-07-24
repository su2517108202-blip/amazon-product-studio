# Migration Notes

## New Migration

```
202607250001_stage8_0_4_role_model_id
```

### SQL
```sql
ALTER TABLE "ModelRoleAssignment" ADD COLUMN "modelId" TEXT;
ALTER TABLE "ModelRoleAssignment" ADD COLUMN "isUserForced" BOOLEAN NOT NULL DEFAULT false;
```

### Risk Assessment
- **Type**: Additive only (ALTER TABLE ADD COLUMN)
- **Data loss**: None — new columns are nullable/have defaults
- **Rollback**: `ALTER TABLE "ModelRoleAssignment" DROP COLUMN "modelId"` + `DROP COLUMN "isUserForced"`
- **Compatibility**: Fully backward compatible — existing code that doesn't read these columns continues to work

### Pre-existing Migrations (unchanged)
All earlier migrations from 202607230000 through 202607240002 remain as-is.

### Deleted Migration (not in this branch)
`202607250000_stage8_0_4_discovered_models` — existed only in the experimental branch `backup/stage-8-0-4-provider-refactor`. Never applied to any database. Not included in this branch.
