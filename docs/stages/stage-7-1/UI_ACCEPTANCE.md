# Stage 7.1 UI Acceptance

## Environment

- Repository: `su2517108202-blip/amazon-product-studio`
- Branch: `codex/stage-7-1-cn-upload-fix`
- Browser: Chrome through local browser automation
- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Local app URL: `http://localhost:3000`
- Test project route: `/projects/cmrxtauxc000u3opgnmbeixjs`
- New upstream paid image-generation calls during acceptance: `0`

## Pages Visited

- `/`
- `/settings/providers`
- `/projects/cmrxtauxc000u3opgnmbeixjs`

## Real Browser Operations

1. Opened the project list and confirmed the project list renders in simplified Chinese.
2. Opened provider settings and confirmed service provider, model, role binding, capability, test status, and API key display are Chinese-readable.
3. Confirmed the API key is masked and no full key is visible.
4. Created a fresh Chinese product project for Stage 7.1 acceptance.
5. Opened the project studio and confirmed Chinese labels for reference images, product identity, five-image planning, image generation, candidate history, preferred image, download, ZIP, loading, success, error, and confirmation states.
6. Uploaded valid JPG, PNG, WebP, Chinese filename, filename with spaces, and a 4-image batch.
7. Confirmed uploaded images showed thumbnails immediately.
8. Confirmed the first uploaded image became the primary reference image.
9. Confirmed selected analysis/generation checkboxes worked.
10. Ran real Gemini product recognition on selected real reference images and confirmed the saved product identity is Chinese.
11. Ran real Gemini five-image planning and confirmed 5 saved plans with Chinese content.
12. Confirmed refresh restored reference images, identity, and plans.
13. Restarted the local app service and confirmed reference images, identity, and plans were still available.
14. Checked the project studio at mobile `390x844`; no severe horizontal overflow, hidden buttons, or unreadable candidate cards were observed.

## Upload Results

| Case | Result |
| --- | --- |
| Single JPG | Passed, `201` |
| Single PNG | Passed, `201` |
| Single WebP | Passed, `201` |
| Chinese filename | Passed, `201` |
| Filename with spaces | Passed, `201` |
| Batch upload of 4 valid images | Passed, `201` |
| Exceed reference-image limit | Passed, rejected with Chinese error |
| Non-image file | Passed, rejected with Chinese error |
| Empty file | Passed after fix, rejected with Chinese error |
| Oversized file | Passed, rejected with Chinese error |
| Spoofed MIME/signature mismatch | Passed in automated route test, rejected atomically |
| Mixed valid/invalid batch | Passed in automated route test, no partial database records and no orphan files |

## Root Cause Found

The Stage 7 upload route trusted the browser-provided MIME type too much and did not validate the actual file signature before saving. It also did not enforce a dedicated reference-image size limit, did not reject empty image uploads, and did not make mixed batch uploads atomic. During pre-fix browser reproduction, an empty PNG upload could return success and appear as a reference image.

## Chinese Output Results

- Product identity saved: yes.
- Product identity language: simplified Chinese.
- Five-image plans saved: `5`.
- Five-image planning language: simplified Chinese.
- Test project product recognized as: `哑光黑不锈钢随行杯`.
- Old English Stage 4 data was not modified.

## Provider Call Accounting

- Real Gemini vision recognition calls during Stage 7.1 acceptance: `1` successful product recognition.
- Real Gemini planning calls during Stage 7.1 acceptance: `1` successful five-image planning call.
- Real upstream image-generation calls during Stage 7.1 acceptance: `0`.
- No forced regeneration or automatic five-image paid generation was triggered.

## Screenshots

- `docs/stages/stage-7-1/ui-acceptance/01-chinese-project-list.png`
- `docs/stages/stage-7-1/ui-acceptance/02-chinese-provider-settings.png`
- `docs/stages/stage-7-1/ui-acceptance/03-upload-before.png`
- `docs/stages/stage-7-1/ui-acceptance/04-upload-success.png`
- `docs/stages/stage-7-1/ui-acceptance/05-chinese-product-identity.png`
- `docs/stages/stage-7-1/ui-acceptance/06-chinese-five-image-plans.png`
- `docs/stages/stage-7-1/ui-acceptance/07-mobile-chinese-project.png`

## Console Result

No blocking browser console errors were observed on the checked pages.

## Readability Result

- Desktop `1440x900`: project list, provider settings, project studio, reference image cards, product identity, plan tabs, planning editor, image generation area, candidate history, preferred state, download area, ZIP area, and dialogs remained readable after font-size increases.
- Mobile `390x844`: body text stayed at or above 14px, inputs stayed at or above 16px, tap targets were at least 42px high, and the five-image navigation did not produce severe overflow or blocked controls.

## Issues Fixed During Acceptance

- Upload validation was hardened to reject empty, non-image, spoofed, oversized, over-limit, and mixed invalid batches.
- Chinese prompt guards were added for product identity and five-image planning.
- The local Gemini planning acceptance timed out with a 30 second provider timeout; the local BYOK profile timeout was raised to 90 seconds for this acceptance environment.
- Global readable typography rules were added and tiny user-facing text patterns were removed from the main app source.
