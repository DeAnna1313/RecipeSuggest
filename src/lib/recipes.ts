import OpenAI from "openai";

/** One recipe step: main action plus optional extra guidance (tips, temps, safety). */
export interface RecipeInstructionStep {
  text: string;
  guidance: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cookTime: string;
  difficulty: "easy" | "medium" | "hard";
  ingredients: string[];
  instructions: RecipeInstructionStep[];
  /** Portions the ingredient amounts are written for (used for scaling). */
  servings?: number;
  imageUrl?: string;
}

/** Normalize API/localStorage instructions (legacy string[] or partial objects). */
export function normalizeRecipeInstructions(raw: unknown): RecipeInstructionStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") {
      const text = item.trim();
      return { text: text || "Step", guidance: "" };
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const fromText =
        typeof o.text === "string"
          ? o.text.trim()
          : typeof o.step === "string"
            ? o.step.trim()
            : "";
      const text = fromText || String(o.main ?? "").trim() || "Step";
      const guidanceRaw =
        typeof o.guidance === "string"
          ? o.guidance.trim()
          : typeof o.tip === "string"
            ? o.tip.trim()
            : "";
      return { text, guidance: guidanceRaw };
    }
    return { text: String(item), guidance: "" };
  });
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
  options: { excludeRecipeIds?: string[] } = {},
): Promise<Recipe[]> {
  const c = normalizeConstraints(constraints);
  const excludeRecipeIds = Array.isArray(options.excludeRecipeIds)
    ? options.excludeRecipeIds.map((v) => String(v).trim()).filter(Boolean).sort()
    : [];
  const key = JSON.stringify({
    base: cacheKey(ingredients, c),
    excludeRecipeIds,
  });

  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const client = getOpenAIClient();

  const systemPrompt = `You are a careful cooking coach for beginners (including teenagers with little kitchen experience). The user lists ingredients they already have. Suggest exactly 4 recipes that work well with those ingredients.

Accuracy and safety (NON-NEGOTIABLE):
- Base cooking methods, times, temperatures, and food-safety steps on standard home-kitchen practice and widely published food-safety guidance (e.g. USDA/FDA for the US). Do not invent "shortcuts" that skip safe handling of raw animal products.
- Do not present guesses as facts. If a time or temperature varies by thickness or equipment, say so and tell the cook what to verify (e.g. internal temperature with a thermometer).
- For raw poultry (chicken, turkey, duck, etc.): instructions MUST state that the cook must heat the poultry to a safe internal temperature of 165°F (74°C) measured with a food thermometer in the thickest part (no relying on "until the soup boils" or color alone as proof of safety). For ground poultry, the same 165°F (74°C) minimum applies.
- If a recipe uses chicken or other poultry that is NOT cooked from raw (e.g. rotisserie, leftover roasted, canned, or par-cooked product), state that explicitly in BOTH the ingredients list AND the instructions (e.g. "2 cups cooked shredded chicken breast (from rotisserie or leftovers)"). Never imply raw poultry is safe because a liquid was brought to a boil unless you also include the internal-temp rule for any raw pieces.
- Whenever poultry or meat appears, name it precisely in ingredients: species, cut, and form (e.g. "1 lb boneless skinless chicken thighs, raw" vs "2 cups diced cooked chicken breast"). Same for other meats (pork chops, ground beef, etc.)—raw vs precooked and cut/grind.
- For other high-risk foods (ground meats, eggs in sauces, leftovers), follow conventional safe temperatures and handling; state doneness by internal temperature where it matters, not only by time.
- Briefly note cross-contamination basics when raw poultry/meat is used (use a clean board/utensils after cooking, wash hands)—one short phrase in a relevant step is enough.

Rules for ingredients (IMPORTANT):
- The "ingredients" array must list EVERYTHING used in the dish, including common pantry items if they appear in the recipe: e.g. butter, salt, black pepper, olive oil or vegetable oil, water, sugar, flour, garlic, lemon juice, basic spices, etc. Use clear amounts where helpful (e.g. "2 tbsp butter", "salt and black pepper to taste").
- Do not hide staples—someone should read the list and know what to gather before cooking, even if they already have it at home.

Rules for instructions (IMPORTANT):
- Use 6–14 steps per recipe. One main action per step, in strict order.
- Every step MUST be an object with "text" and "guidance" (both strings). "text" = the primary action (what to do now, clearly and in order). "guidance" = a second line of helpful detail that does NOT repeat "text" verbatim: e.g. internal temps and how to measure them, visual/texture cues for doneness, timing if it varies by thickness, equipment tips, or one concise safety note. Every step MUST have a non-empty "guidance" with at least one concrete detail.
- Be explicit in the pair together: approximate heat, stirring, what "done" looks like—distribute between text and guidance as needed without duplication.
- Define terms briefly when needed (e.g. in guidance: "dice = small cubes").
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
  "instructions": [
    {
      "text": "Primary step action (clear, ordered).",
      "guidance": "Extra detail only: temps, doneness cues, timing variables, tips—do not repeat text verbatim."
    }
  ]
}`;

  const excludePrompt = excludeRecipeIds.length
    ? `\nDo not repeat or closely duplicate any recipe whose id is in this list: ${excludeRecipeIds.join(", ")}. Create four clearly different recipe ideas from the earlier batch.`
    : "";
  const userPrompt = `I have these ingredients: ${ingredients.join(", ")}${constraintsPromptBlock(c)}${excludePrompt}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.55,
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
      (r as Recipe).instructions = normalizeRecipeInstructions(
        (r as Recipe).instructions as unknown,
      );
    }
  }

  cache.set(key, recipes);
  return recipes;
}

function buildRecipeImagePrompt(recipe: Recipe): string {
  const title = (recipe.title ?? "").trim() || "the dish";
  const desc = (recipe.description ?? "").trim().slice(0, 320);
  const ingredients = (recipe.ingredients ?? [])
    .map((i) => String(i).trim())
    .filter(Boolean)
    .slice(0, 16)
    .join("; ");

  const parts = [
    "Photorealistic editorial food photograph of ONE finished plated dish.",
    `The dish must unmistakably be: "${title}".`,
    desc ? `How it should look (flavor, style, texture cues): ${desc}` : "",
    ingredients
      ? `Plated food should clearly reflect these ingredients (cooked and combined, not a separate ingredient flat-lay): ${ingredients}`
      : "",
    "Must match this specific recipe, not a generic unrelated meal.",
    "Single plate or shallow bowl; 45° or three-quarter angle; shallow depth of field; appetizing natural light.",
    "No people, hands, faces, packaging, raw shopping piles, or multiple unrelated dishes.",
    "No text, letters, numbers, watermarks, or logos anywhere in the image.",
  ];
  return parts.filter(Boolean).join(" ");
}

export async function generateRecipeImage(recipe: Recipe): Promise<string> {
  const client = getOpenAIClient();
  const prompt = buildRecipeImagePrompt(recipe);

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    quality: "medium",
  });

  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("Image generation returned no image data.");
  }

  return `data:image/png;base64,${imageBase64}`;
}
