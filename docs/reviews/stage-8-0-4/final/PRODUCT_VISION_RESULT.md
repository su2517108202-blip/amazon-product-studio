# Product Vision Result

## Status
Verified with a real local JPG product image and a real Gemini product-vision request.

## Local Flow Verified
1. Created a local validation project.
2. Uploaded a real JPG product image.
3. Bound product vision to the saved Gemini provider profile.
4. Triggered product recognition from the local workspace.
5. Confirmed `ProductIdentity` was saved.
6. Confirmed name suggestions displayed in the workspace.
7. Refreshed the project page and confirmed saved identity data remained available.

## HTTP Results
- JPG upload: HTTP 201.
- Product recognition: HTTP 200.
- Product identity read after refresh: HTTP 200.

## Actual Model
- Provider: Gemini.
- Model used successfully: `gemini-flash-latest`.
- Selected images sent for recognition: 1.
- Result status: completed.

## Saved ProductIdentity
- `ProductIdentity` was saved.
- `isStale`: false after successful recognition.
- Source provider: `gemini`.
- Source model: `gemini-flash-latest`.

## Name Suggestions
- The workspace displayed the AI name suggestion panel after recognition.
- Example recognized product wording included a black matte portable travel coffee cup.

## Non-Goal
- Real paid image generation was not triggered.
- Real paid image generation calls added: 0.

## Account-Specific Model Finding
- A product-vision call using `models/gemini-2.5-flash` returned `MODEL_NOT_FOUND` for the current account.
- This is not documented as a global deprecation for every Gemini account.
