# Stage 7 UI Acceptance

## Pages Visited

- `http://localhost:3000`
- `http://localhost:3000/settings/providers`
- `http://localhost:3000/projects/cmrwl7jxk0000ogpgkfjbah7g`

## Browser And Viewports

- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Test project: `Stage 4 Gemini Acceptance`
- Product: `Matte black stainless steel travel tumbler`

## Page Checks

| Check | Result |
| --- | --- |
| Project list displayed | Passed |
| Project studio entered from project list | Passed |
| Provider settings displayed | Passed |
| API key not exposed in full | Passed |
| No obvious mojibake | Passed |
| No blocking browser console errors | Passed |
| Reference images displayed | Passed |
| Primary reference marker displayed | Passed |
| Analysis checkbox displayed | Passed |
| Generation checkbox displayed | Passed |
| ProductIdentity displayed | Passed |
| Five image-plan tabs switch | Passed |
| Plan content edit and save | Passed |
| Generation provider/model status visible | Passed |
| Existing real generated image displayed | Passed |
| Refresh restores data | Passed |
| Service restart restores data | Passed |

## Stage 7 Interaction Checks

| Check | Result |
| --- | --- |
| Candidate history displayed per plan | Passed |
| Multiple plan 1 candidates switch visually | Passed |
| Set preferred image | Passed |
| Replace preferred image | Passed |
| Clear preferred image | Passed |
| Preferred status persists after refresh | Passed |
| Preferred status persists after service restart | Passed |
| Five plans show candidate counts and preferred state | Passed |
| Single download button usable | Passed |
| Single download MIME and extension correct | Passed |
| Single downloaded file opens | Passed |
| Non-preferred delete requires confirmation | Passed |
| Preferred candidate cannot be directly deleted | Passed |
| ZIP disabled at `4/5` and shows missing plan | Passed |
| ZIP enabled at `5/5` | Passed |
| ZIP extracts to exactly 5 images | Passed |
| ZIP order and names correct | Passed |

## Step Notes

1. Opened the project list and confirmed the Stage 4 Gemini Acceptance project was visible.
2. Opened provider settings and confirmed provider cards rendered without exposing a full API key.
3. Opened the Stage 4 Gemini Acceptance project studio.
4. Confirmed four reference images displayed and the front image was marked primary.
5. Confirmed ProductIdentity content displayed and was not stale.
6. Switched through image plans 1 to 5.
7. Edited a plan title, saved it through the UI, restored the original value, and reset the temporary manual-edit marker before final capture.
8. Used plan 1 candidate history to set, replace, clear, and restore a preferred Gemini candidate.
9. Used controlled local candidates on plans 2 to 5 to validate `5/5` preferred completion and ZIP export without paid provider calls.
10. Deleted a non-preferred local test candidate after confirmation.
11. Confirmed preferred candidates were protected from direct deletion.
12. Downloaded a single PNG candidate and validated its MIME, extension, and file signature.
13. Exported the preferred set and verified the ZIP contents.
14. Refreshed the page and restarted the local service; candidate and preferred states recovered.
15. Rechecked desktop and mobile screenshots for readability and severe horizontal overflow.

## Download Verification

Single-image download:

- Candidate: `stage7-ui-zip-structure-image`
- MIME: `image/png`
- Filename: `02-structure-candidate-01.png`
- Result: valid PNG file.

ZIP export:

- MIME: `application/zip`
- Filename: `Stage-4-Gemini-Acceptance-preferred-images.zip`
- Entries:
  - `01-hero.jpg`
  - `02-structure.png`
  - `03-function.png`
  - `04-scenario.png`
  - `05-detail.png`
- Result: exactly 5 files in expected plan order.

## Provider Call Accounting

- New upstream paid image calls during UI acceptance: `0`
- Real Provider historical images used: plan 1 Gemini candidates generated in earlier Stage 6 validation.
- Stage 7 local controlled candidates used: plan 2 to plan 5 export candidates and one plan 1 delete-flow candidate.

## Console Errors

No blocking browser console errors were observed during checked flows.

## UI Issues Found And Fixed

- During early acceptance clicking, one reference image delete control was accidentally targeted. The original reference file and database row were restored before final screenshots and final database verification.
- The temporary plan-title edit used to validate save behavior was restored before final verification.
- No Stage 7 UI code issue remained after the final desktop and mobile checks.

## Screenshots

- `docs/stages/stage-7/ui-acceptance/01-project-list.png`
- `docs/stages/stage-7/ui-acceptance/02-provider-settings.png`
- `docs/stages/stage-7/ui-acceptance/03-reference-images.png`
- `docs/stages/stage-7/ui-acceptance/04-product-identity.png`
- `docs/stages/stage-7/ui-acceptance/05-five-image-plans.png`
- `docs/stages/stage-7/ui-acceptance/06-candidate-history.png`
- `docs/stages/stage-7/ui-acceptance/07-preferred-image.png`
- `docs/stages/stage-7/ui-acceptance/08-single-download.png`
- `docs/stages/stage-7/ui-acceptance/09-five-of-five-progress.png`
- `docs/stages/stage-7/ui-acceptance/10-zip-export.png`
- `docs/stages/stage-7/ui-acceptance/11-mobile-project.png`
- `docs/stages/stage-7/ui-acceptance/12-mobile-candidate-history.png`
