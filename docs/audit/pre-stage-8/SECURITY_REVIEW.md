# Security Review

## Secrets And Sensitive Data

- `.env`, `.env.*`, `storage/`, `tmp/`, `node_modules/`, `.next/`, local database directories, database exports, real generated image bundles, API keys, database passwords, proxy credentials, Authorization headers, cookies, session tokens, and image Base64 were not added to this audit package.
- Provider profile responses expose `maskedApiKey` and `hasApiKey`, not the encrypted secret.
- OpenAI-compatible providers send API keys in the `Authorization` header.
- Gemini sends API keys in `x-goog-api-key`; no key-in-URL usage was observed in the current Gemini adapter.

## Access Control Review

- Project-scoped routes generally require current user and project ownership.
- Storage access validates path normalization, project ownership, and a matching reference/generated image database record.
- Async generation checks reload runs through owned queries and avoid catch-path mutation by id alone.
- Candidate APIs exclude prompt snapshots and sensitive provider fields.

## High-Risk Areas To Revisit

- Reference-image upload concurrency can exceed limits or create multiple primary images.
- Reference-image filenames can collide due `Date.now()` naming.
- Reference-image validation checks magic bytes but does not decode images.
- Reference-image storage extension follows client filename instead of detected MIME.
- Legacy `/api/upload` remains in the app and logs masked API-key prefixes for the upstream MUAPI path.
- `npm audit` reports 14 dependency vulnerabilities, including 1 critical advisory.

## GitHub Actions

The current CI workflow triggers on:

- `codex/**`
- `main`
- pull requests

CI runs install, Prisma generate, migration deploy, Stage 6.1 checks, Stage 6.2 checks, Stage 7 checks, Stage 7.1 checks, lint, and build.
