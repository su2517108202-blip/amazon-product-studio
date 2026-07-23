# Stage 7.2 UI Acceptance

## Environment

- Branch: `codex/stage-7-2-pre-stage-8-remediation`
- Local mode: enabled
- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Routes:
  - `/`
  - `/settings/providers`
  - `/projects/cmrxz44ft0000f8pg6tyda8yo`

## Browser Walkthrough

1. Opened the home page and confirmed the project list loads with simplified Chinese product text.
2. Confirmed the navigation shows the Chinese local-mode label and no user-facing English brand text.
3. Opened Provider settings and confirmed Provider rows render in Chinese, masked secrets are not expanded, and reference-image capability status is visible.
4. Created a new Chinese acceptance project: `阶段7.2中文验收项目`.
5. Opened the project studio and attempted browser file upload. The in-app browser runtime reported that file chooser uploads are unsupported.
6. Exercised the same running app upload endpoint with controlled local test images, then refreshed the browser page.
7. Confirmed JPG, PNG, WebP, Chinese filename, space-containing filename, and a 4-file batch persisted and displayed as reference-image thumbnails.
8. Confirmed the first reference image was marked as the primary image.
9. Confirmed product identity content displays in Chinese without mojibake.
10. Confirmed the five ImagePlan tabs display Chinese content and can be selected.
11. Confirmed generated-image Provider/model/status and reference-image support are visible.
12. Confirmed candidate history loads the first page, then loads additional pages without duplicate items.
13. Set a generated image as preferred and confirmed the visible preferred state updated.
14. Checked mobile layout at `390x844` and confirmed no horizontal overflow.

## Upload Results

- Single JPG: passed
- Single PNG: passed
- Single WebP: passed
- Chinese filename: passed
- Space-containing filename: passed
- Four-file batch: passed
- Misleading extension stored by detected MIME: passed
- Corrupt image with valid header rejected: passed
- Concurrent same-name upload collision protection: passed
- Concurrent 14-image limit protection: passed
- Concurrent first-upload primary protection: passed
- Cross-user upload rejection: passed

## Candidate Pagination Results

- Seeded candidate count for plan 1: `25`
- Initial visible candidate page: loaded
- Load-more operation: passed
- Duplicate candidate IDs after pagination: none
- Final load-more button state after all pages: hidden

## Console

- Blocking browser console errors: none observed

## Paid Calls

- New paid upstream image-generation calls: `0`
- Product identity and plan data used for this acceptance were controlled local fixtures.

## Screenshots

- `docs/stages/stage-7-2/ui-acceptance/01-home-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/02-navbar-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/03-provider-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/04-upload-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/05-project-studio-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/06-five-plans-cn.png`
- `docs/stages/stage-7-2/ui-acceptance/07-candidate-pagination.png`
- `docs/stages/stage-7-2/ui-acceptance/08-mobile-cn.png`

## Notes

- Screenshots are sanitized and do not contain full API keys, database passwords, Authorization headers, proxy credentials, local absolute paths, image Base64, or storage internals.
- The direct browser file-picker step could not be completed because the current in-app browser runtime does not expose file upload support. The actual upload route was still tested against the same running local service and then verified through the browser UI after refresh.
