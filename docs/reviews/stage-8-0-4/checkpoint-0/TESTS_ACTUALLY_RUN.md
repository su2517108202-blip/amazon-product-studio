# Tests Actually Run — Checkpoint 0

## Executed Tests

### Build
```bash
npx next build
```
**Result**: PASS (exit code 0, 0 errors in build.log, "✓ Compiled successfully")

### Lint
```bash
npx eslint src/lib/provider-profiles.js src/lib/providers/errors.js src/lib/providers/gemini.js src/lib/provider-runtime.js "src/app/api/**/route.js"
```
**Result**: PASS (0 errors, 0 warnings)

```bash
npx eslint "src/app/page.js" "src/app/projects/**/ProjectStudioClient.js" "src/app/settings/**/ProviderSettingsClient.js"
```
**Result**: PASS (0 errors, 1 pre-existing warning about `<img>` tag)

## NOT Executed Tests

| Test Script | Status |
|-------------|--------|
| `npm run test:stage-8-0-4` | **NOT EXECUTED** — requires database |
| `npm run test:stage-8-0-3` | **NOT EXECUTED** — not required for checkpoint |
| `npm run test:stage-8` | **NOT EXECUTED** |
| `npm run test:stage-7-2-1` | **NOT EXECUTED** |
| `npm run test:stage-7-2` | **NOT EXECUTED** |
| `npm run lint` (full) | **NOT EXECUTED** |
| Any Playwright test | **NOT EXECUTED** |
| Product analysis E2E | **NOT EXECUTED** — database offline |
| Model discovery E2E | **NOT EXECUTED** — database offline |
| Image generation E2E | **NOT EXECUTED** |
