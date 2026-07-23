# Stage 7.2.1 UI Acceptance

## Browser Setup

- Browser: Playwright Chromium
- Desktop viewport: `1440x900`
- Mobile viewport: `390x844`
- Local mode: enabled
- Server mode: production build through `next start`

## Steps

1. Opened `/`.
2. Filled the home page project name and product name fields.
3. Created a test project in the browser session.
4. Opened the new project studio.
5. Confirmed the reference-image file input accept string is `image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp`.
6. Confirmed the selector does not include GIF.
7. Uploaded JPG, PNG, and WebP files through `setInputFiles()` on the real file input.
8. Captured upload progress state.
9. Captured the real upload network response.
10. Confirmed the upload response status was `201`.
11. Confirmed three thumbnails appeared immediately.
12. Confirmed the first uploaded image was marked primary.
13. Refreshed the page and confirmed all three thumbnails and the primary state remained.
14. Switched to mobile viewport and confirmed there was no severe horizontal overflow.

## Results

- Real browser file input upload: passed
- Network upload request captured: passed
- JPG upload: passed
- PNG upload: passed
- WebP upload: passed
- First image primary: passed
- Refresh recovery: passed
- GIF selector removal: passed
- Desktop readability: passed
- Mobile readability: passed
- New paid Provider image-generation calls: `0`

## Screenshots

- `docs/stages/stage-7-2-1/ui-acceptance/01-upload-file-input.png`
- `docs/stages/stage-7-2-1/ui-acceptance/02-upload-progress.png`
- `docs/stages/stage-7-2-1/ui-acceptance/03-upload-thumbnails.png`
- `docs/stages/stage-7-2-1/ui-acceptance/04-readable-candidates.png`
- `docs/stages/stage-7-2-1/ui-acceptance/05-mobile-readable.png`

## Sanitization

- Screenshots and reports do not contain full API keys, database passwords, proxy credentials, Authorization headers, local absolute paths, image Base64, or raw generated image bytes.
