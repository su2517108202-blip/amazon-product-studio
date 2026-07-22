# Stage 1 Baseline

## Scope

This baseline records the verified upstream run state before local single-user and project-system work begins.

## Project

- Project path: `F:\codex\amazon-product-studio`
- Current branch: `codex/stage-1-original-run`
- Local URL: `http://localhost:3000`
- Database name: `amazon_product_studio_stage1`
- Database URL shape: `postgresql://postgres@localhost:55432/amazon_product_studio_stage1`

## Versions

- Node.js: `v24.14.0`
- npm: `11.9.0`
- Next.js: `16.2.6`
- React: `19.2.4`
- Prisma CLI: `7.8.0`
- Prisma Client: `7.8.0`
- PostgreSQL: `17.10`

## Verification

- `npx prisma generate`: passed
- `npx prisma db push`: passed against the independent local PostgreSQL database
- `npm run dev`: passed
- `GET http://127.0.0.1:3000`: passed with HTTP `200`
- `npm run build`: passed
- `npm run lint`: passed with warnings only

## Lint Compatibility Changes

Only these files were changed to satisfy the current ESLint rules while preserving the original upstream behavior:

- `src/app/page.js`
- `src/app/gallery/page.js`
- `src/app/pricing/page.js`

## Known Lint Warnings

`npm run lint` currently reports 7 warnings and 0 errors. All warnings are Next.js `<img>` optimization warnings:

- `src/app/gallery/page.js`: 3 warnings
- `src/app/page.js`: 3 warnings
- `src/components/Navbar.js`: 1 warning

These warnings are intentionally left in place for the upstream baseline.

## Secret Handling

- `.env` is ignored by Git through `.gitignore`.
- `.env` is not tracked by Git.
- `.env.example` contains placeholders only and no real API keys, OAuth secrets, Stripe keys, MuAPI keys, or database passwords.

## Local PostgreSQL Layout

The active independent database runtime is stored outside the repository on the game drive:

- `F:\codex-data\amazon-product-studio\.local`

An earlier `winget` attempt left a Windows PostgreSQL service on the C drive named `postgresql-x64-17`. That service requires administrator permissions to stop or remove. It does not affect the F-drive portable PostgreSQL database used by this project, which runs on port `55432`.
