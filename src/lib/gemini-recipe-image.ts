import { GoogleGenAI, Modality } from "@google/genai";

/** Gemini 2.5 Flash Image — "Nano Banana" (Google AI). */
export const GEMINI_RECIPE_IMAGE_MODEL = "gemini-2.5-flash-image";

export function getGeminiApiKey(): string {
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

type GenImageRow = {
  image?: { imageBytes?: string; mimeType?: string };
};

function dataUrlFromBase64(mime: string, b64: string): string {
  const clean = b64.replace(/\s/g, "");
  return `data:${mime};base64,${clean}`;
}

/** Supports multiple response shapes from the image-capable Gemini models. */
export function extractImageDataUrlFromGeminiResponse(
  response: unknown,
): string | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const genImages = r.generatedImages as GenImageRow[] | undefined;
  const gen = genImages?.[0]?.image;
  if (gen?.imageBytes) {
    const mime = gen.mimeType?.trim() || "image/png";
    return dataUrlFromBase64(mime, gen.imageBytes);
  }

  const candidates = r.candidates as
    | Array<{ content?: { parts?: unknown[] } }>
    | undefined;
  for (const c of candidates ?? []) {
    for (const rawPart of c.content?.parts ?? []) {
      const part = rawPart as Record<string, unknown>;
      const inline = part.inlineData as
        | { data?: string; mimeType?: string }
        | undefined;
      if (inline?.data && typeof inline.data === "string") {
        const mime = inline.mimeType?.trim() || "image/png";
        return dataUrlFromBase64(mime, inline.data);
      }
      const legacy = part.inline_data as
        | { data?: string; mime_type?: string; mimeType?: string }
        | undefined;
      if (legacy?.data && typeof legacy.data === "string") {
        const mime =
          (legacy.mime_type ?? legacy.mimeType)?.trim() || "image/png";
        return dataUrlFromBase64(mime, legacy.data);
      }
    }
  }

  return null;
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
      // Image models expect both modalities per Google image-generation docs.
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  const ext = extractImageDataUrlFromGeminiResponse(response);
  if (ext) return ext;

  if (!response.candidates?.length) {
    const block = response.promptFeedback?.blockReason;
    const hint = block ? ` (${String(block)})` : "";
    throw new Error(`Gemini returned no image candidates${hint}.`);
  }

  throw new Error(
    "Gemini returned no image bytes (no inline_data / generatedImages).",
  );
}
