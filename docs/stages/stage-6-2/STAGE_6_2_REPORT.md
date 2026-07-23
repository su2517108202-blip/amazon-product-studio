# Stage 6.2 Report: Async Check Auth And CI Fix

## Branch, Implementation Commit, Seal Tag

- Branch: `codex/stage-6-2-auth-ci-fix`
- Base seal commit: `3b1b119ff89dca74a68433fe85b9981745e5baa8`
- Implementation commit: `c69a302bb6bd581e49c6f4e838fb81711e53943d`
- Seal tag: `stage-6-2-auth-ci-fix`
- Repository: `su2517108202-blip/amazon-product-studio`
- Upstream repository: `SamurAIGPT/amazon-product-studio`

Stage 6.2 only fixes the async generation check permission boundary, adds runtime authorization tests, and broadens CI branch triggers. Stage 7 work was not started.

## Fixes

- Removed the unsafe catch-path `findUnique()` lookup by run id in the async check route.
- All async check reads, updates, failed markings, attempt increments, and provider calls now require a run already confirmed to belong to the current user.
- `requireCurrentUser()` failures return a safe 401 without querying runs, mutating runs, or calling upstream providers.
- Cross-user run checks return a safe not-found response without leaking provider, model, or external task details.
- Completed and failed run short-circuit behavior is preserved and does not call upstream.
- GitHub Actions now runs on `codex/**`, `main`, and pull requests.
- CI now runs both Stage 6.1 source checks and Stage 6.2 runtime async auth checks.
- Stage 6.1 docs now distinguish Implementation commit, Seal tag, and Seal tag target to avoid Git self-reference confusion.

## Runtime Authorization Tests

- Unauthenticated async check: passed.
- Cross-user async check: passed.
- Legal owner processing check: passed.
- Completed run skips upstream: passed.
- Failed run skips upstream: passed.
- Provider terminal error only updates the legal owner's run: passed.

The runtime tests start a temporary Next server and a local fake provider. They do not call real image providers or use real API keys.

## Verification

- `npx prisma generate --config prisma.config.ts`: passed.
- Empty database `npx prisma migrate deploy --config prisma.config.ts`: passed.
- `npm run test:stage-6-1`: passed.
- `npm run test:stage-6-2`: passed.
- `npm run lint`: passed with existing 6 `<img>` warnings.
- `npm run build`: passed.
- GitHub Actions: checked after push; final result is reported in chat.

## Out Of Scope

- Candidate image history.
- Preferred image selection.
- Downloads and ZIP export.
- Batch generation of five images.
- Image deletion and version management.
- Canva, ComfyUI, video, AI model, and other Stage 7 features.
