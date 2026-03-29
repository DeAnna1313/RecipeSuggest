# RecipeSuggest

RecipeSuggest is an Astro app that accepts a list of ingredients and returns recipe suggestions from the OpenAI API. It runs on Netlify (serverless) with optional bookmark sync to Netlify Blobs and Clerk authentication.

## Requirements

- Node `22.12.0` or `24.x`
- **OpenAI** — `OPENAI_API_KEY` in `.env` for suggestions and optional dish images
- **Clerk** (optional for local smoke tests; CI uses placeholder keys):
  - `PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`

Odd-numbered Node releases such as Node `25.x` are not a supported target for Astro and can fail during `astro build` with module resolution errors.

Password reset is handled by Clerk's sign-in flow. To make the reset email and new-password flow available, enable email/password authentication in your Clerk dashboard.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Chat completions (`gpt-4o-mini`) and optional images (`gpt-image-1`) |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Sign-in and `Astro.locals.auth()` |
| `NETLIFY_BLOB_*` | Set automatically on Netlify for `getStore()` (bookmarks + rate limits) |

### Rate limiting

- **Production (Netlify):** `/api/suggest` and `/api/bookmark-image` use a **`rate-limits`** Netlify Blob store for fixed-window counts per user or IP so limits persist across cold starts and instances.
- **Local / no Blobs:** The same routes fall back to the in-memory limiter in `src/lib/rate-limit.ts`.

Default windows: suggest — 24/hr anonymous, 96/hr signed-in (15-minute window in code); images — 12/hr anonymous, 48/hr signed-in (1-hour window).

### Bookmarks

Signed-in users sync bookmarks to the **`recipe-bookmarks`** store via `/api/bookmarks-data`. Without blob configuration, the API returns an error and the app still uses `localStorage`.

## Run

```sh
npm install
npm run dev
```

The app starts at `http://localhost:4322`.

## Build

```sh
npm run build
npm run preview
```

## Tests

End-to-end smoke tests mock `POST /api/suggest` so **no OpenAI call** is required:

```sh
npx playwright install chromium
npm run test:e2e
```

Optional CI: copy `docs/github-actions-e2e.example.yml` to `.github/workflows/e2e.yml` (or add it in the GitHub UI). Pushes that modify files under `.github/workflows/` need a Git credential with the **`workflow`** OAuth scope; tools that omit it will show `refusing to allow an OAuth App ... without workflow scope`.

## Deploy (Netlify)

1. Connect the repo and set environment variables (`OPENAI_API_KEY`, Clerk keys).
2. Use the Netlify Astro preset (this project uses `@astrojs/netlify`).
3. Ensure **Netlify Blobs** are enabled for the site so bookmark and rate-limit stores work in production.
4. Optional: add deploy previews and verify Clerk allowed origins include preview URLs.

## Project files

```text
src/pages/index.astro          — Main UI, HTMX suggest, modal, cook mode
src/pages/api/suggest.astro    — Recipe suggestions
src/pages/api/bookmark-image.astro — Optional AI dish photo
src/pages/api/bookmarks-data.astro — Blob sync for bookmarks
src/pages/api/export-recipe-html.astro — Download printable HTML
src/lib/recipes.ts             — OpenAI prompts and parsing
src/lib/rate-limit-hybrid.ts  — Blob-backed limits with memory fallback
public/styles/global.css       — Theme tokens (`data-theme` light/dark)
```
