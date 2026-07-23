# UI And Workflow Matrix

## Browser Smoke Summary

| Area | Route | Desktop Result | Mobile Result | Notes |
| --- | --- | --- | --- | --- |
| Project list | `/` | Loads, Chinese form visible, project creation works | not fully repeated after creation | Contains English `Lingtu E-commerce Studio` and `Local`. |
| Provider settings | `/settings/providers` | Loads, Chinese labels visible, key field masked | checked at `390x844` | No complete key observed. |
| Project studio | `/projects/[projectId]` | Loads and workflows function | no horizontal overflow at `390x844` | Static Chinese labels are mojibake in `ProjectStudioClient.js`. |
| Upload | project studio | JPG/PNG/WebP/Chinese name/batch succeed | inherited from same route | Invalid files rejected with codes. |
| Product identity | project studio | existing identity displays, real analyze returned 200 | mobile visible but labels garbled | Stage 4 project data includes English product data by design. |
| Five plans | project studio | 5/5 plans, reuse returned 200 | mobile visible but labels garbled | Plan tabs switchable by UI surface; labels garbled. |
| Generation history | project studio | existing generated history visible through API and page route | mobile visible | No new image generation clicked. |
| Preferred image | project studio | 5/5 preferred present | mobile visible | Preferred state restored after restart. |
| Single download | download route | `200`, `image/jpeg`, safe filename | not separately repeated on mobile | Browser-origin fetch used. |
| ZIP export | ZIP route | `200`, `application/zip`, safe filename | not separately repeated on mobile | Browser-origin fetch used. |

## Upload Smoke Results

| Case | HTTP Status | Result |
| --- | --- | --- |
| Single JPG | `201` | uploaded; first image became primary |
| Single PNG | `201` | uploaded |
| Single WebP | `201` | uploaded |
| Chinese filename with spaces | `201` | uploaded; original display filename preserved |
| Batch upload of 4 PNGs | `201` | uploaded |
| Non-image file | `400` | rejected with `UNSUPPORTED_IMAGE_TYPE` |
| Empty file | `400` | rejected with `EMPTY_FILE` |
| Oversized file | `413` | rejected with `IMAGE_TOO_LARGE` |
| Exceed 14 images | `409` | rejected with `TOO_MANY_REFERENCE_IMAGES` |

After valid uploads, the project had `8` reference images and `1` primary reference image. The temporary audit project was deleted after smoke testing.

## Workflow Smoke Results

- New project: passed.
- Modify project: page fields loaded and save route is available; no destructive data rewrite was retained.
- Delete project: `DELETE /api/projects/[projectId]` returned `200`, subsequent read returned `404`.
- Product recognition: real browser-origin `POST /analyze` returned `200` on the Stage 4 Gemini Acceptance project.
- Five-image planning: browser-origin `POST /image-plans/generate` returned `200`, reused existing 5 plans.
- Candidate history: `GET /generated-images` returned `200` and 3 candidates for plan 1.
- Preferred image: preferred candidate present.
- Single download: `200`, `image/jpeg`, `01-hero-candidate-03.jpg`, `335147` bytes.
- ZIP export: `200`, `application/zip`, `Stage-4-Gemini-Acceptance-preferred-images.zip`, `409864` bytes.
- Refresh recovery: plans `5`, preferred `5`, generated `5`.
- Service restart recovery: plans `5`, preferred `5`, generated `5`.

## Chinese And Readability

- Provider settings page: simplified Chinese labels are readable.
- Project list: mostly Chinese, but `Lingtu E-commerce Studio` and `Local` remain English.
- Project studio: major static Chinese labels are mojibake in the browser.
- Mobile `390x844`: no severe horizontal overflow was detected; `scrollWidth` equaled viewport width.
- Mobile input minimum font size measured `16px`.
- Browser-measured `text10`: `0`.
- Browser-measured `fontBlack`: `0`.
