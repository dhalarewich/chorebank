import { NextResponse } from "next/server";
import { REWARDS } from "@/lib/chore-board/defaults";
import { requireSession } from "@/lib/server/auth/guards";
import { getRewards } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    if (session.mode === "demo") {
      return NextResponse.json({ rewards: REWARDS });
    }

    const rewards = await getRewards(session.householdId);
    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}
