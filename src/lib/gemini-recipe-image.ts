import { GoogleGenAI, Modality } from "@google/genai";

/** Gemini 2.5 Flash Image — "Nano Banana" (Google AI). */
export const GEMINI_RECIPE_IMAGE_MODEL = "gemini-2.5-flash-image";

function getGeminiApiKey(): string {
  const apiKey =
    import.meta.env.GEMINI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it in .env locally and in Netlify site environment variables.",
    );
  }
  return apiKey.trim();
}

/**
 * Text-to-image for recipe card photos. Returns a data URL (PNG or JPEG per API).
 */
export async function generateRecipeImageWithGemini(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const response = await ai.models.generateContent({
    model: GEMINI_RECIPE_IMAGE_MODEL,
    contents: prompt,
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  const blockReason =
    response.promptFeedback?.blockReason ??
    response.candidates?.[0]?.finishReason;
  if (!response.candidates?.length) {
    const hint =
      typeof blockReason === "string" ? ` (${blockReason})` : "";
    throw new Error(`Gemini returned no image candidates${hint}.`);
  }

  const parts = response.candidates[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data && inline?.mimeType) {
      return `data:${inline.mimeType};base64,${inline.data}`;
    }
  }

  throw new Error("Gemini returned no inline image data.");
}
