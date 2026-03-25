import OpenAI from "openai";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cookTime: string;
  difficulty: "easy" | "medium" | "hard";
  ingredients: string[];
  instructions: string[];
}

/* ── In-memory response cache ────────────────── */
const cache = new Map<string, Recipe[]>();

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

  const apiKey =
    import.meta.env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });

  const systemPrompt = `You are a helpful cooking assistant. The user will give you a list of ingredients they have on hand. Suggest exactly 4 recipes they can make. Each recipe should primarily use the listed ingredients, but you may include a few common pantry staples (salt, pepper, oil, water, basic spices, etc.) without listing them separately.

Return ONLY valid JSON — no markdown, no code fences, no commentary. The JSON must be an array of exactly 4 objects with this schema:

{
  "id": "unique-slug",
  "title": "Recipe Title",
  "description": "A short 1-2 sentence description of the dish.",
  "cookTime": "e.g. 25 mins",
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1 text", "Step 2 text"]
}`;

  const userPrompt = `I have these ingredients: ${ingredients.join(", ")}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
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
