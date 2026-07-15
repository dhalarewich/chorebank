import { NextResponse } from "next/server";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { getAdminChores, getAdminRewards } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [], rewards: [] });
    }

    const [chores, rewards] = await Promise.all([getAdminChores(session.householdId), getAdminRewards(session.householdId)]);
    return NextResponse.json({ chores, rewards });
  } catch (error) {
    return errorResponse(error);
  }
}
