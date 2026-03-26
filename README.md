# RecipeSuggest

RecipeSuggest is an Astro app that accepts a list of ingredients and returns recipe suggestions from the OpenAI API.

## Requirements

- Node `22.12.0` or `24.x`
- `OPENAI_API_KEY` in `.env`

Odd-numbered Node releases such as Node `25.x` are not a supported target for Astro and can fail during `astro build` with module resolution errors.

## Run

```sh
npm install
npm run dev
```

The app starts at `http://localhost:4321`.

## Build

```sh
npm run build
npm run preview
```

## Project Files

```text
src/pages/index.astro
src/pages/api/suggest.astro
src/lib/recipes.ts
public/styles/global.css
```
