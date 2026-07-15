import { NextResponse } from "next/server";
import { resolveRequestHouseholdId } from "@/lib/auth/session";
import { DomainError } from "@/lib/server/domain/board-service";
import { getRequestIp, takeRateLimitToken } from "@/lib/server/auth/rate-limit";
import { listKidLoginOptions } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ip = getRequestIp(request);
    const rate = await takeRateLimitToken({
      key: `auth-children:${ip}`,
      limit: 80,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      throw new DomainError(`Too many lookup requests. Try again in ${rate.retryAfterSeconds}s.`, "RATE_LIMITED", 429);
    }

    const url = new URL(request.url);
    const rawHouseholdId = url.searchParams.get("householdId");
    const householdId = resolveRequestHouseholdId(request, rawHouseholdId);
    if (!householdId) {
      return NextResponse.json({ householdId: "", children: [] });
    }

    const children = await listKidLoginOptions(householdId);
    return NextResponse.json({ householdId, children });
  } catch (error) {
    return errorResponse(error);
  }
}
