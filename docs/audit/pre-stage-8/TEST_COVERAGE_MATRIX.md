# Test Coverage Matrix

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm ci` | passed | 14 audit vulnerabilities reported after install. |
| `npx prisma generate --config prisma.config.ts` | passed | Also passed on temporary migration DB. |
| `npx prisma migrate deploy --config prisma.config.ts` | passed | Passed on empty temporary PostgreSQL database. |
| `npm run test:stage-6-1` | passed | Storage/auth/async hardening checks. |
| `npm run test:stage-6-2` | passed | Runtime async auth boundary checks. |
| `npm run test:stage-7` | passed | Candidate history, preferred image, downloads, ZIP, async regressions. |
| `npm run test:stage-7-1` | passed | Upload validation and Chinese output guards. |
| `npm run lint` | passed with warnings | Existing 6 `<img>` warnings. |
| `npm run build` | passed | Production build completed. |
| `npm audit --json` | completed with non-zero advisory result | 14 vulnerabilities: 4 moderate, 9 high, 1 critical. |

## Coverage Categories

| Category | Present | Evidence | Gap |
| --- | --- | --- | --- |
| Source string checks | yes | Stage 7.1 Chinese-output tests | Does not catch mojibake in `ProjectStudioClient.js`. |
| Unit tests | partial | pure helper checks in stage scripts | No broad isolated unit test suite. |
| Database integration tests | yes | stage 7 and 7.1 scripts use temporary DBs | Concurrency upload race not covered. |
| Route runtime tests | yes | stage 6.2, 7, 7.1 | Legacy `/api/upload` not covered. |
| Browser E2E | partial | stage 7/7.1 reports and this audit smoke | No committed Playwright/browser E2E suite. |
| Real Provider tests | partial | Stage 4/5/6/7.1 reports and this audit analyze 200 | Provider calls are not deterministic CI tests. |
| Human screenshot acceptance | yes | `docs/stages/stage-7/` and `docs/stages/stage-7-1/` | Current audit found later mojibake not caught by screenshots. |

## Potential False Positives

- Route tests can pass while browser UI text is mojibake.
- Upload tests validate sequential and mixed invalid batches, but not true concurrent upload races.
- Planning reuse can pass while stale or English legacy project data remains.
- Provider adapter capability gates can pass without real validation for every provider/protocol pair.
