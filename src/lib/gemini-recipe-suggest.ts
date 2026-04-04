import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "./gemini-recipe-image";

/** Gemini 2.5 Flash — price/performance for structured recipe JSON. */
export const GEMINI_RECIPE_TEXT_MODEL = "gemini-2.5-flash";

/**
 * Returns raw JSON text: an array of recipe objects. Uses JSON response mode.
 */
export async function generateRecipesJsonWithGemini(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const response = await ai.models.generateContent({
    model: GEMINI_RECIPE_TEXT_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.72,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  if (!response.candidates?.length) {
    const block = response.promptFeedback?.blockReason;
    throw new Error(
      block
        ? `Recipe generation was blocked (${String(block)}). Try different ingredients or preferences.`
        : "Recipe generation returned no response. Try again in a moment.",
    );
  }

  const text = response.text?.trim();
  if (!text) {
    throw new Error("AI returned an empty recipe response.");
  }
  return text;
}
