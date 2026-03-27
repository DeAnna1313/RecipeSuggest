import OpenAI from "openai";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cookTime: string;
  difficulty: "easy" | "medium" | "hard";
  ingredients: string[];
  instructions: string[];
  imageUrl?: string;
}

/* ── In-memory response cache ────────────────── */
const cache = new Map<string, Recipe[]>();

function getOpenAIClient() {
  const apiKey =
    import.meta.env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({ apiKey });
}

function cacheKey(ingredients: string[]): string {
  return [...ingredients]
    .sort()
    .map((i) => i.trim().toLowerCase())
    .join("|");
}

/* ── Main function ───────────────────────────── */
export async function suggestRecipes(ingredients: string[]): Promise<Recipe[]> {
  const key = cacheKey(ingredients);

  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const client = getOpenAIClient();

  const systemPrompt = `You are a careful cooking coach for beginners (including teenagers with little kitchen experience). The user lists ingredients they already have. Suggest exactly 4 recipes that work well with those ingredients.

Rules for ingredients (IMPORTANT):
- The "ingredients" array must list EVERYTHING used in the dish, including common pantry items if they appear in the recipe: e.g. butter, salt, black pepper, olive oil or vegetable oil, water, sugar, flour, garlic, lemon juice, basic spices, etc. Use clear amounts where helpful (e.g. "2 tbsp butter", "salt and black pepper to taste").
- Do not hide staples—someone should read the list and know what to gather before cooking, even if they already have it at home.

Rules for instructions (IMPORTANT):
- Use 6–14 steps per recipe. One main action per step, in strict order.
- Be explicit: say approximate heat (e.g. medium heat), times, when to stir, what "done" looks like (color/texture), and simple safety (hot pan, oven mitts for oven).
- Define terms briefly when needed (e.g. "dice = small cubes").
- Assume no prior knowledge but keep language friendly, not condescending.

Return ONLY valid JSON — no markdown, no code fences, no commentary. The JSON must be an array of exactly 4 objects with this schema:

{
  "id": "unique-slug",
  "title": "Recipe Title",
  "description": "A short 1-2 sentence description of the dish.",
  "cookTime": "e.g. 25 mins",
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": ["each item with amount if sensible"],
  "instructions": ["Step 1 — ...", "Step 2 — ..."]
}`;

  const userPrompt = `I have these ingredients: ${ingredients.join(", ")}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 5000,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "[]";

  let recipes: Recipe[];
  try {
    recipes = JSON.parse(raw);
  } catch {
    // Try extracting JSON from markdown code fences just in case
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      recipes = JSON.parse(match[0]);
    } else {
      throw new Error("AI returned invalid JSON.");
    }
  }

  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new Error("AI returned an empty or invalid response.");
  }

  cache.set(key, recipes);
  return recipes;
}

export async function generateRecipeImage(recipe: Recipe): Promise<string> {
  const client = getOpenAIClient();
  const prompt = [
    "Simple realistic photo of the finished plated dish only.",
    recipe.title + ".",
    recipe.description.slice(0, 200),
    "Natural light, no text or watermark.",
  ].join(" ");

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    quality: "low",
  });

  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("Image generation returned no image data.");
  }

  return `data:image/png;base64,${imageBase64}`;
}
