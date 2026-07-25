# Tests Actually Run

## Database And Migration
| Check | Result |
| --- | --- |
| PostgreSQL `localhost:55432` | passed |
| `npx prisma validate --config prisma.config.ts` | passed |
| `npx prisma generate --config prisma.config.ts` | passed |
| `npx prisma migrate deploy --config prisma.config.ts` | passed |

## Regression Tests
| Command | Result |
| --- | --- |
| `npm run test:stage-7-2-1` | passed |
| `npm run test:stage-8` | passed |
| `npm run test:stage-8-0-2` | passed |
| `npm run test:stage-8-0-3` | passed |
| `node scripts/stage-8-0-4-checkpoint-0-1-tests.mjs` | passed |

## Final Commands For This Closure
| Command | Result |
| --- | --- |
| `npm audit --omit=dev --audit-level=high` | passed with exit code 0 |
| `npm run lint` | passed, 0 errors and 5 pre-existing warnings |
| `npm run build` | passed, with existing Turbopack NFT trace warning |
| `npm run test:stage-8-0-4` | passed |

## npm audit Result
- Critical vulnerabilities: 0.
- High vulnerabilities: 0.
- Moderate vulnerabilities: 4.
- Reported moderate advisories are transitive through Prisma tooling (`@hono/node-server`, `valibot`).
- Suggested automatic fix requires `npm audit fix --force` and would install `prisma@7.9.0`, outside the current stated dependency range.
- No dependency upgrade was made in this closure task.

## Real API / Browser Checks
| Check | Result |
| --- | --- |
| Settings page load | HTTP 200, no database error |
| Gemini official model discovery | HTTP 200, 50 models |
| Product vision role binding | HTTP 200 |
| Real JPG upload | HTTP 201 |
| Real product recognition | HTTP 200 |
| ProductIdentity persisted after refresh | passed |
| Name suggestion panel displayed | passed |
| Real paid image generation calls | 0 |

## Notes
- `models/gemini-2.5-flash` returned `MODEL_NOT_FOUND` only for the current account during product-vision invocation.
- The successful real product-vision model was `gemini-flash-latest`.
