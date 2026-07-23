# Real Browser Smoke

## Environment

- Local route: `http://localhost:3000`
- Browser: in-app Chrome browser automation
- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Baseline: `stage-7-1-cn-upload-fix`
- No new image-generation request was clicked or triggered.

## Pages Visited

- `/`
- `/settings/providers`
- `/projects/cmrxv2guq0000uwpgqmctop8z` temporary audit upload project
- `/projects/cmrwl7jxk0000ogpgkfjbah7g` existing Stage 4 Gemini Acceptance project

## New Project Smoke

Created from homepage:

- Name pattern: `阶段8前审计上传项目-*`
- Product name: `审计测试水杯`
- Result: project appeared in homepage list.
- Temporary project id: `cmrxv2guq0000uwpgqmctop8z`

The temporary audit project was deleted after upload smoke:

- `DELETE /api/projects/cmrxv2guq0000uwpgqmctop8z`: `200`
- Subsequent `GET /api/projects/cmrxv2guq0000uwpgqmctop8z`: `404`

## Upload Network Evidence

Server log summary for the temporary project:

- `POST /api/projects/[projectId]/reference-images 201` for JPG.
- `POST /api/projects/[projectId]/reference-images 201` for PNG.
- `POST /api/projects/[projectId]/reference-images 201` for WebP.
- `POST /api/projects/[projectId]/reference-images 201` for Chinese filename with spaces.
- `POST /api/projects/[projectId]/reference-images 201` for 4-image batch.
- `POST /api/projects/[projectId]/reference-images 400` for non-image.
- `POST /api/projects/[projectId]/reference-images 400` for empty file.
- `POST /api/projects/[projectId]/reference-images 413` for oversized file.
- `POST /api/projects/[projectId]/reference-images 409` for exceeding 14 images.

Browser-origin response summary:

| Case | Status | Response |
| --- | --- | --- |
| JPG | `201` | `image/jpeg`, primary `true` |
| PNG | `201` | `image/png` |
| WebP | `201` | `image/webp` |
| Chinese spaced filename | `201` | original filename preserved |
| Batch 4 | `201` | 4 rows returned |
| Non-image | `400` | `UNSUPPORTED_IMAGE_TYPE` |
| Empty file | `400` | `EMPTY_FILE` |
| Oversized | `413` | `IMAGE_TOO_LARGE` |
| Over limit | `409` | `TOO_MANY_REFERENCE_IMAGES` |

Current valid-upload failure root cause:

- No valid JPG/PNG/WebP upload failure was reproduced in this audit.
- Invalid uploads fail at the API validation layer with status codes above.
- Risk remains for concurrency and file-integrity edge cases listed in `KNOWN_FAILURES.md`.

## Recognition, Planning, History, Download, ZIP

Existing project used:

- Project: `Stage 4 Gemini Acceptance`
- Project id: `cmrwl7jxk0000ogpgkfjbah7g`

Results:

- Product identity route loaded.
- Browser-origin product recognition `POST /analyze`: `200`.
- Browser-origin planning `POST /image-plans/generate`: `200`, reused existing 5 plans.
- Candidate history route: `200`, 3 candidates on plan 1.
- Preferred image: present.
- Single download: `200`, `image/jpeg`, filename `01-hero-candidate-03.jpg`, `335147` bytes.
- ZIP export: `200`, `application/zip`, filename `Stage-4-Gemini-Acceptance-preferred-images.zip`, `409864` bytes.
- Refresh recovery: 5 plans, 5 preferred, 5 generated-plan coverage.
- Service restart recovery: 5 plans, 5 preferred, 5 generated-plan coverage.

## UI And Readability

- Provider settings page rendered readable Chinese and masked API Key.
- Project studio static labels displayed mojibake.
- Mobile `390x844` had no severe horizontal overflow.
- Mobile input minimum size measured `16px`.
- No 10px readable text or `font-black` was measured in the mobile smoke.
