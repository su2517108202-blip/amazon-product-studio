# Known Broken Behavior — Checkpoint 0

## Critical: Prisma Client / Database Mismatch

**Error**: If the application is started with the regenerated Prisma Client but the database has NOT been migrated, any query to `ModelRoleAssignment` will fail because the generated SQL refers to columns (`modelId`, `isUserForced`) that don't exist in the database yet.

**Cause**: `prisma generate` was run after schema change, but `prisma migrate deploy` was NOT run because the database is offline.

**Impact**: The settings page (`/settings/providers`) will fail when loading role assignments. The home page may also fail when loading assignment status.

## Cannot Verify: Model Discovery

Model discovery via `/api/provider-models/discover` cannot be tested because:
1. Database must be online to use Mode A (providerProfileId)
2. No real API key configured
3. No saved ProviderProfile exists in the database

## Cannot Verify: Product Analysis

Product analysis (商品识别) cannot be tested because:
1. Database offline → cannot save provider profile
2. Database offline → cannot create project / upload images
3. Database offline → cannot bind role assignment
4. No real Gemini API key

## Confirmed Working

- `npx next build` — Compiles successfully (0 errors)
- `npx eslint` on modified files — Passes (0 errors)
- `npx prisma generate` — Generates successfully

## Not Tested at Runtime

- Settings page UI rendering
- Model list discovery button
- Role binding with model override
- Product analysis request flow
- Image generation request flow
- Name suggestion banner
- Diagnostic error display
- Gemini error classification with real API responses
