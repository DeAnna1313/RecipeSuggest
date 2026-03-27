import { getStore } from "@netlify/blobs";
import {
  type RateOptions,
  checkRateLimit,
  clientKeyFromRequest,
} from "./rate-limit";

type Row = { count: number; resetAt: number };

export type RateCheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function memoryFallbackKey(
  request: Request,
  userId: string | null | undefined,
  kind: "suggest" | "image",
): string {
  const base = clientKeyFromRequest(request, userId);
  return kind === "image" ? `${base}:img` : base;
}

function sanitizeBlobKey(part: string): string {
  return part.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 380);
}

/**
 * Uses Netlify Blobs when available; falls back to in-memory limiter in local dev.
 */
export async function checkRateLimitHybrid(
  request: Request,
  userId: string | null | undefined,
  kind: "suggest" | "image",
  opts: RateOptions,
  isAuthed: boolean,
): Promise<RateCheckResult> {
  const max = isAuthed ? opts.maxAuth : opts.maxAnon;
  const base = clientKeyFromRequest(request, userId);
  const blobKey = sanitizeBlobKey(`${kind}:${base}`);

  try {
    const store = getStore("rate-limits");
    const now = Date.now();
    const raw = (await store.get(blobKey, { type: "json" })) as Row | null;
    let count = 0;
    let resetAt = now + opts.windowMs;

    if (raw && typeof raw === "object" && typeof raw.resetAt === "number") {
      if (now < raw.resetAt) {
        count = typeof raw.count === "number" ? raw.count : 0;
        resetAt = raw.resetAt;
      }
    }

    if (count >= max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }

    await store.setJSON(blobKey, { count: count + 1, resetAt });
    return { allowed: true };
  } catch {
    return checkRateLimit(
      memoryFallbackKey(request, userId, kind),
      opts,
      isAuthed,
    );
  }
}
