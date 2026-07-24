# Stage 8.0.2 Local Usability Hotfix

Branch: `codex/stage-8-0-2-local-usability-fix`

This hotfix stays within Stage 8 and does not add paid provider calls or Stage 9 work.

## Fixes

- Handles concurrent default local user creation by retrying `P2002` id conflicts with `findUnique`.
- Allows draft provider model discovery before saving a provider profile.
- Splits provider settings into service provider configuration, role binding, and local storage settings.
- Keeps the three model roles independently bound to saved provider configurations.
- Replaces the local gallery source with `Project`, `ReferenceImage`, `GeneratedImage`, and `ImagePlan`.
- Adds local-only storage root settings and confirmed asset migration without deleting the old directory.

## Acceptance

- New test script: `npm run test:stage-8-0-2`
- CI includes Stage 8.0.2 after Stage 8 Playwright checks.
- Paid provider calls: 0
