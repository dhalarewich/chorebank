import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieValue,
  getSessionContext,
  resolveRequestHouseholdId,
} from "@/lib/auth/session";
import { DomainError, verifyKidPin, verifyParentLogin } from "@/lib/server/domain/board-service";
import { getRequestIp, takeRateLimitToken } from "@/lib/server/auth/rate-limit";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const loginSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("parent-login"),
    householdId: z.string().min(1).optional(),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({
    action: z.literal("kid-pin"),
    householdId: z.string().min(1).optional(),
    pin: z.string().min(4).max(12),
  }),
  z.object({
    action: z.literal("logout"),
  }),
]);

function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function GET(request: Request) {
  const session = getSessionContext(request);
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request);
    const globalRate = await takeRateLimitToken({
      key: `auth-session:${ip}`,
      limit: 40,
      windowMs: 60_000,
    });
    if (!globalRate.allowed) {
      throw new DomainError(`Too many sign-in attempts. Try again in ${globalRate.retryAfterSeconds}s.`, "RATE_LIMITED", 429);
    }

    const parsed = loginSchema.parse(await request.json());

    if (parsed.action === "logout") {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(SESSION_COOKIE_NAME, "", {
        ...cookieOptions(request),
        maxAge: 0,
      });
      return response;
    }

    if (parsed.action === "parent-login") {
      const householdId = resolveRequestHouseholdId(request, parsed.householdId);
      if (!householdId) {
        throw new DomainError("Missing household context", "NO_HOUSEHOLD", 400);
      }
      const parentRate = await takeRateLimitToken({
        key: `auth-parent:${ip}:${householdId}:${parsed.email.toLowerCase()}`,
        limit: 12,
        windowMs: 5 * 60_000,
      });
      if (!parentRate.allowed) {
        throw new DomainError(`Too many sign-in attempts. Try again in ${parentRate.retryAfterSeconds}s.`, "RATE_LIMITED", 429);
      }

      const result = await verifyParentLogin({
        householdSlug: householdId,
        email: parsed.email,
        password: parsed.password,
      });

      const response = NextResponse.json({
        ok: true,
        session: {
          mode: "live",
          householdId: result.householdId,
          actor: "parent",
          userId: result.userId,
        },
      });

      response.cookies.set(
        SESSION_COOKIE_NAME,
        createSessionCookieValue({
          householdId: result.householdId,
          actor: "parent",
          userId: result.userId,
        }),
        cookieOptions(request),
      );

      return response;
    }

    const householdId = resolveRequestHouseholdId(request, parsed.householdId);
    if (!householdId) {
      throw new DomainError("Missing household context", "NO_HOUSEHOLD", 400);
    }
    const kidRate = await takeRateLimitToken({
      key: `auth-kid:${ip}:${householdId}`,
      limit: 20,
      windowMs: 5 * 60_000,
    });
    if (!kidRate.allowed) {
      throw new DomainError(`Too many PIN attempts. Try again in ${kidRate.retryAfterSeconds}s.`, "RATE_LIMITED", 429);
    }

    const result = await verifyKidPin({
      householdSlug: householdId,
      pin: parsed.pin,
    });

    const response = NextResponse.json({
      ok: true,
      session: {
        mode: "live",
        householdId: result.householdId,
        actor: "kid",
      },
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionCookieValue({
        householdId: result.householdId,
        actor: "kid",
      }),
      cookieOptions(request),
    );

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
