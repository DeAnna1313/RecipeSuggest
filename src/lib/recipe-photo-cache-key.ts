import { createHash } from "node:crypto";

export type RecipePhotoKeyInput = {
  title?: string;
  description?: string;
  ingredients?: string[];
};

function normalizeIngredients(ingredients: string[]): string {
  return [...ingredients]
    .map((i) => String(i).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\n");
}

/**
 * Fingerprint for a finished dish, shared across all users and sessions.
 * Unlike `assignStableRecipeIds`, this does not include batch index — two
 * searches that produce the same title, description, and ingredient list hit
 * the same Netlify Blob image cache.
 */
export function buildRecipePhotoCacheKey(recipe: RecipePhotoKeyInput): string {
  const ing = normalizeIngredients(recipe.ingredients ?? []);
  const title = String(recipe.title ?? "").trim().toLowerCase();
  const desc = String(recipe.description ?? "").trim().toLowerCase().slice(0, 280);
  const h = createHash("sha256")
    .update(`v1\0${ing}\0${title}\0${desc}`)
    .digest("hex")
    .slice(0, 22);
  return `dish-${h}`;
}
