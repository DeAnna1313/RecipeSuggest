/** Build a minimal standalone HTML document for one recipe (open in browser or print to PDF). */

import type { Recipe } from "./recipes";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function recipeToStandaloneHtml(recipe: Recipe): string {
  const ing = (recipe.ingredients ?? [])
    .map((i) => `<li>${esc(String(i))}</li>`)
    .join("");
  const steps = (recipe.instructions ?? [])
    .map((s) => `<li>${esc(String(s))}</li>`)
    .join("");
  const title = esc(recipe.title || "Recipe");
  const desc = esc(recipe.description || "");
  const servings =
    typeof recipe.servings === "number" &&
    Number.isFinite(recipe.servings) &&
    recipe.servings > 0
      ? `<p class="meta">Serves ${esc(String(recipe.servings))}</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
h1{font-size:1.5rem}
.meta{color:#555;font-size:.95rem;margin:.5rem 0 1rem}
ul,ol{padding-left:1.25rem}
li{margin:.35rem 0}
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">${esc(recipe.cookTime || "")} · ${esc(recipe.difficulty || "")}</p>
${servings}
<p>${desc}</p>
<h2>Ingredients</h2>
<ul>${ing}</ul>
<h2>Instructions</h2>
<ol>${steps}</ol>
<p><small>Exported from RecipeSuggest.</small></p>
</body>
</html>`;
}

export function recipesCollectionToHtml(recipes: Recipe[]): string {
  const blocks = recipes.map((r) => {
    const body = recipeToStandaloneHtml(r);
    const start = body.indexOf("<body>");
    const end = body.indexOf("</body>");
    if (start === -1 || end === -1) return "";
    return `<article class="recipe-export-block">${body.slice(start + 6, end)}</article><hr/>`;
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>RecipeSuggest — exported recipes</title>
<style>
body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
.recipe-export-block{margin-bottom:2rem}
hr{border:0;border-top:1px solid #ccc;margin:2rem 0}
</style>
</head>
<body>
<h1>Saved recipes</h1>
${blocks.join("\n")}
<p><small>Exported from RecipeSuggest.</small></p>
</body>
</html>`;
}
