import { getStore } from "@netlify/blobs";

const STORE_NAME = "recipe-photos";

function blobKey(recipeId: string): string {
  return recipeId.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 380);
}

/** Returns cached data URL if Blobs are available and key exists. */
export async function getCachedRecipePhoto(
  recipeId: string,
): Promise<string | null> {
  try {
    const store = getStore(STORE_NAME);
    const row = (await store.get(blobKey(recipeId), {
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

export async function setCachedRecipePhoto(
  recipeId: string,
  dataUrl: string,
): Promise<void> {
  if (!dataUrl.startsWith("data:")) return;
  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(blobKey(recipeId), {
      dataUrl,
      updatedAt: Date.now(),
    });
  } catch {
    /* ignore */
  }
}
