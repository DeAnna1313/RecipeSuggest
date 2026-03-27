/** Simple in-memory fixed window limiter for serverless single-instance / dev. */

export type RateOptions = {
  maxAnon: number;
  maxAuth: number;
  windowMs: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function clientKeyFromRequest(
  request: Request,
  userId: string | null | undefined,
): string {
  if (userId) return `u:${userId}`;
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || "local";
  return `ip:${ip}`;
}

export function checkRateLimit(
  key: string,
  opts: RateOptions,
  isAuthed: boolean,
):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number } {
  const max = isAuthed ? opts.maxAuth : opts.maxAnon;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return { allowed: true };
}
