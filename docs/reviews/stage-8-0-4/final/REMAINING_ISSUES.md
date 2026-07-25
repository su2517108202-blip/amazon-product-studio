# Remaining Issues

## Blocking Issues
None for Stage 8.0.4 closure.

## Recorded Non-Blocking Findings
1. `models/gemini-2.5-flash` returned `MODEL_NOT_FOUND` for the current account during a real product-vision call.
   - This is account/key-specific evidence only.
   - It must not be described as a global Gemini outage or global model removal.
   - The verified working model for this local setup is `gemini-flash-latest`.
2. `npm audit --omit=dev --audit-level=high` exited successfully because there are no high or critical production vulnerabilities.
   - It still reports 4 moderate vulnerabilities through Prisma tooling.
   - The suggested fix requires a force upgrade outside the current dependency range, so it was not applied here.
3. Existing lint warnings about `<img>` remain.
   - They are warnings, not errors.
   - They are not introduced by this closure task.
4. Build still reports an existing Turbopack NFT trace warning involving `next.config.mjs` and storage routing.
   - Build completed successfully.

## Explicit Non-Goals
- No Stage 9 work.
- No new provider features.
- No database reset.
- No real paid image generation.
- No dependency upgrades.
- No formal tag creation.
