import OpenAI from "openai";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cookTime: string;
  difficulty: "easy" | "medium" | "hard";
  ingredients: string[];
  instructions: string[];
  /** Portions the ingredient amounts are written for (used for scaling). */
  servings?: number;
  imageUrl?: string;
}

export type UnitSystem = "us" | "metric";

export interface SuggestConstraints {
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  nutFree?: boolean;
  maxTimeMins?: number;
  notes?: string;
  /** Target servings for every suggested recipe (default 4). */
  servings?: number;
  /** Ingredient measurements in US customary vs metric. */
  unitSystem?: UnitSystem;
  /** Cooking hardware the user has available. */
  appliances?: string[];
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

function normalizeConstraints(
  c: SuggestConstraints | undefined,
): SuggestConstraints {
  if (!c || typeof c !== "object") return {};
  const max = Number(c.maxTimeMins);
  const serv = Number(c.servings);
  const unit =
    c.unitSystem === "metric" || c.unitSystem === "us" ? c.unitSystem : undefined;
  const appliances = Array.isArray(c.appliances)
    ? [...new Set(
        c.appliances
          .map((v) => String(v).trim().toLowerCase())
          .filter(Boolean),
      )]
    : undefined;
  return {
    vegetarian: !!c.vegetarian,
    vegan: !!c.vegan,
    glutenFree: !!c.glutenFree,
    dairyFree: !!c.dairyFree,
    nutFree: !!c.nutFree,
    maxTimeMins: Number.isFinite(max) && max > 0 ? Math.round(max) : undefined,
    notes:
      typeof c.notes === "string" && c.notes.trim() ? c.notes.trim() : undefined,
    servings:
      Number.isFinite(serv) && serv >= 1 && serv <= 24 ? Math.round(serv) : undefined,
    unitSystem: unit,
    appliances: appliances?.length ? appliances : undefined,
  };
}

function cacheKey(
  ingredients: string[],
  constraints: SuggestConstraints,
): string {
  const ing = [...ingredients]
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return JSON.stringify({ ing, c: constraints });
}

function constraintsPromptBlock(c: SuggestConstraints): string {
  const lines: string[] = [];
  if (c.vegan) {
    lines.push(
      "All recipes must be fully vegan (no meat, fish, dairy, eggs, or honey).",
    );
  } else if (c.vegetarian) {
    lines.push(
      "All recipes must be vegetarian (no meat, fish, or poultry; dairy and eggs are allowed unless otherwise constrained).",
    );
  }
  if (c.glutenFree) {
    lines.push(
      "Avoid gluten: no wheat, barley, rye, or unsafe oats; use labeled gluten-free substitutes when needed.",
    );
  }
  if (c.dairyFree) {
    lines.push(
      "No dairy (no milk, butter, cheese, cream, yogurt); use plant-based substitutes where helpful.",
    );
  }
  if (c.nutFree) {
    lines.push(
      "No peanuts or tree nuts; avoid nut oils and cross-contact ingredients.",
    );
  }
  if (c.maxTimeMins) {
    lines.push(
      `Each recipe must be realistic to finish within about ${c.maxTimeMins} minutes total (prep + cook), given the constraints.`,
    );
  }
  if (c.notes) {
    lines.push(`Additional user preferences: ${c.notes}`);
  }
  if (c.appliances?.length) {
    if (c.appliances.includes("none")) {
      lines.push(
        "The user has no cooking hardware available. Only suggest recipes that do not require stove, oven, microwave, air fryer, or other cooking equipment.",
      );
    } else {
      lines.push(
        `Only use these cooking hardware options: ${c.appliances.join(", ")}. Do not rely on equipment outside this list.`,
      );
    }
  }
  const servings = c.servings ?? 4;
  lines.push(
    `Write ingredient amounts for ${servings} serving${servings === 1 ? "" : "s"} each (consistent across all four recipes). Include "servings": ${servings} in each recipe object.`,
  );
  if (c.unitSystem === "metric") {
    lines.push(
      "Use metric measurements only in ingredient lines (g, kg, ml, L, °C where relevant).",
    );
  } else if (c.unitSystem === "us") {
    lines.push(
      "Use US customary measurements in ingredient lines (cups, tbsp, tsp, oz, lb, °F where relevant).",
    );
  }
  return `\n\nStrict requirements (you must follow all):\n- ${lines.join("\n- ")}`;
}

/* ── Main function ───────────────────────────── */
export async function suggestRecipes(
  ingredients: string[],
  constraints: SuggestConstraints = {},
): Promise<Recipe[]> {
  const c = normalizeConstraints(constraints);
  const key = cacheKey(ingredients, c);

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

If the user gave dietary or time constraints in their message, every recipe must satisfy them. If it is impossible with only their listed ingredients, prefer recipes that are close and note any minimal extra need in the description (still obey JSON schema).

Return ONLY valid JSON — no markdown, no code fences, no commentary. The JSON must be an array of exactly 4 objects with this schema:

{
  "id": "unique-slug",
  "title": "Recipe Title",
  "description": "A short 1-2 sentence description of the dish.",
  "cookTime": "e.g. 25 mins",
  "difficulty": "easy" | "medium" | "hard",
  "servings": 4,
  "ingredients": ["each item with amount if sensible"],
  "instructions": ["Step 1 — ...", "Step 2 — ..."]
}`;

  const userPrompt = `I have these ingredients: ${ingredients.join(", ")}${constraintsPromptBlock(c)}`;

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

  const targetServings = c.servings ?? 4;
  for (const r of recipes) {
    if (r && typeof r === "object") {
      const n = Number((r as Recipe).servings);
      (r as Recipe).servings =
        Number.isFinite(n) && n > 0 ? Math.round(n) : targetServings;
    }
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
