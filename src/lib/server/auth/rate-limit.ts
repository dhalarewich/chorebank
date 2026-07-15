import { prisma } from "@/lib/server/prisma";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function takeRateLimitTokenMemory({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function takeRateLimitToken({
  key,
  limit,
  windowMs,
  scope = "auth",
}: {
  key: string;
  limit: number;
  windowMs: number;
  scope?: string;
}): Promise<RateLimitResult> {
  const normalizedKey = key.slice(0, 256);
  if (!process.env.DATABASE_URL) {
    return takeRateLimitTokenMemory({ key: `${scope}:${normalizedKey}`, limit, windowMs });
  }

  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowEndMs = windowStartMs + windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowEndMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));

  try {
    const bucket = await prisma.$transaction(async (tx) => {
      await tx.rateLimitBucket.deleteMany({
        where: {
          scope,
          key: normalizedKey,
          expiresAt: { lte: new Date(nowMs) },
        },
      });

      const existing = await tx.rateLimitBucket.findUnique({
        where: {
          scope_key_windowStart: {
            scope,
            key: normalizedKey,
            windowStart,
          },
        },
      });

      if (!existing) {
        const created = await tx.rateLimitBucket.create({
          data: {
            scope,
            key: normalizedKey,
            windowStart,
            count: 1,
            expiresAt,
          },
        });
        return { count: created.count, blocked: false };
      }

      if (existing.count >= limit) {
        return { count: existing.count, blocked: true };
      }

      const updated = await tx.rateLimitBucket.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
      return { count: updated.count, blocked: false };
    });

    if (bucket.blocked) {
      return { allowed: false, retryAfterSeconds };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  } catch {
    return takeRateLimitTokenMemory({ key: `${scope}:${normalizedKey}`, limit, windowMs });
  }
}
