import { getStore } from "@netlify/blobs";
import { buildRecipePhotoCacheKey } from "./recipe-photo-cache-key";

const STORE_NAME = "recipe-photos";

function blobKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 380);
}

export type RecipePhotoIdentity = {
  id?: string;
  photoCacheKey?: string;
  title?: string;
  description?: string;
  ingredients?: string[];
};

/** All Blob keys under which this recipe's photo may be stored or looked up. */
export function resolveRecipePhotoCacheKeys(
  recipe: RecipePhotoIdentity,
): string[] {
  const primary =
    recipe.photoCacheKey?.trim() ||
    buildRecipePhotoCacheKey({
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
    });
  const id = recipe.id?.trim();
  const keys: string[] = [primary];
  if (id && id !== primary) keys.push(id);
  return keys;
}

async function getCachedRecipePhotoByKey(key: string): Promise<string | null> {
  try {
    const store = getStore(STORE_NAME);
    const row = (await store.get(blobKey(key), {
      type: "json",
    })) as { dataUrl?: string } | null;
    if (
      row &&
      typeof row.dataUrl === "string" &&
      row.dataUrl.startsWith("data:")
    ) {
      return row.dataUrl;
    }
  } catch {
    /* Local dev or Blobs unavailable */
  }
  return null;
}

/** Tries content fingerprint first, then legacy `recipe.id` (same Netlify site = shared for all users). */
export async function findCachedRecipePhoto(
  recipe: RecipePhotoIdentity,
): Promise<string | null> {
  for (const key of resolveRecipePhotoCacheKeys(recipe)) {
    const hit = await getCachedRecipePhotoByKey(key);
    if (hit) return hit;
  }
  return null;
}

export async function setCachedRecipePhoto(
  recipe: RecipePhotoIdentity,
  dataUrl: string,
): Promise<void> {
  if (!dataUrl.startsWith("data:")) return;
  for (const key of resolveRecipePhotoCacheKeys(recipe)) {
    try {
      const store = getStore(STORE_NAME);
      await store.setJSON(blobKey(key), {
        dataUrl,
        updatedAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
  }
}
