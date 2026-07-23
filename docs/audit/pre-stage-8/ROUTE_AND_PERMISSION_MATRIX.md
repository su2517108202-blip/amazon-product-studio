# Route And Permission Matrix

## Summary

Most project-scoped routes call `requireCurrentUser()` and then constrain queries by `project.userId` or `projectId` owned by the current user. Stage 6.2 async checks now reload and mutate async runs through owned queries. Storage serving checks path shape, project ownership, and a matching database row.

## Project And Reference Images

| Method | Route | User Required | Ownership Condition | Validation | Sensitive Leakage Review | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/projects` | Yes | `userId` | none | no sensitive fields expected | stage 2+ runtime paths |
| POST | `/api/projects` | Yes | created with `user.id` | name/product/platform/aspect fields | no secrets | browser smoke |
| GET | `/api/projects/[projectId]` | Yes | `id + userId` | project id | no secrets | browser smoke |
| PATCH | `/api/projects/[projectId]` | Yes | pre-read `id + userId` | editable fields | no secrets | browser smoke |
| DELETE | `/api/projects/[projectId]` | Yes | pre-read `id + userId` | project id | no secrets | browser smoke |
| POST | `/api/projects/[projectId]/reference-images` | Yes | `id + userId` | count, size, MIME, signature | no absolute path in response | stage 7.1 tests and browser smoke |
| PATCH | `/api/reference-images/[imageId]` | Yes | image through project user | role, booleans, primary | no secrets | stage tests |
| DELETE | `/api/reference-images/[imageId]` | Yes | image through project user | image id | no secrets | stage tests |

Reference upload audit focus:

- `src/lib/storage.js:12-20`: sanitized file name uses `Date.now()` and client extension.
- `src/lib/storage.js:46-62`: writes file before database row.
- `src/lib/storage.js:198-215`: signature check only verifies magic bytes.
- `src/app/api/projects/[projectId]/reference-images/route.js:30-50`: image count is read before transaction.
- `src/app/api/projects/[projectId]/reference-images/route.js:67-95`: primary image decision uses the initial reference count.

## Product Analysis And Planning

| Method | Route | User Required | Ownership Condition | Validation | Sensitive Leakage Review | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/projects/[projectId]/product-identity` | Yes | `id + userId` | project id | no provider key returned | stage 4+ |
| PATCH | `/api/projects/[projectId]/product-identity` | Yes | `id + userId` | product identity payload | no provider key returned | stage 4+ |
| POST | `/api/projects/[projectId]/analyze` | Yes | `id + userId` | provider role, capability, selected images | logs exclude key | real browser smoke triggered 200 |
| GET | `/api/projects/[projectId]/analysis-runs` | Yes | `id + userId` | project id | no prompt/key fields | stage 4+ |
| GET | `/api/projects/[projectId]/image-plans` | Yes | `id + userId` | project id | no key fields | stage 5+ |
| POST | `/api/projects/[projectId]/image-plans/generate` | Yes | `id + userId` | identity, role, capability | no key fields | real browser smoke reused 200 |
| PATCH | `/api/projects/[projectId]/image-plans/[planId]` | Yes | `projectId + planId + project.userId` | plan fields | no key fields | stage 5+ |
| GET | `/api/projects/[projectId]/image-planning-runs` | Yes | `id + userId` | project id | no key fields | stage 5+ |

## Generation, Storage, Downloads, ZIP

| Method | Route | User Required | Ownership Condition | Validation | Sensitive Leakage Review | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/projects/[projectId]/generation-summary` | Yes | `id + userId` | project id | no prompt/key fields | stage 7 and browser smoke |
| GET | `/api/projects/[projectId]/image-plans/[planId]/generations` | Yes | `projectId + userId`, plan in project | ids | prompt snapshot excluded | stage 7 |
| POST | `/api/projects/[projectId]/image-plans/[planId]/generations` | Yes | `projectId + userId`, plan in project | provider role, protocol, refs | key not returned | stage 6/7 |
| POST | `/api/image-generations/[generationRunId]/check` | Yes | run through project user | async terminal checks | external task hidden from front end | stage 6.2 |
| GET | `/api/projects/[projectId]/image-plans/[planId]/generated-images` | Yes | project and plan ownership | ids | prompt and key fields excluded | browser smoke |
| PATCH | `/api/projects/[projectId]/image-plans/[planId]/preferred-image` | Yes | project, plan, generated image in project | generated image id | no secrets | stage 7 |
| DELETE | `/api/generated-images/[imageId]` | Yes | image through project user | preferred image protection | no secrets | stage 7 |
| GET | `/api/generated-images/[imageId]/download` | Yes | image through project user | image id, storage key | no absolute path returned | browser smoke |
| GET | `/api/projects/[projectId]/exports/preferred-images` | Yes | `id + userId` | exactly 5 preferred images | no absolute path returned | browser smoke |
| GET | `/api/storage/[...path]` | Yes | project ownership and matching DB row | path normalization | no local path returned | stage 6.1/7 |

## Legacy Routes

Legacy `/api/upload`, `/api/creations`, `/api/download`, Stripe routes, and webhook routes remain in the upstream app surface. They are out of the local project workflow but should be revisited before public deployment because `/api/upload` still logs masked API key prefixes and uses the legacy MUAPI path.
