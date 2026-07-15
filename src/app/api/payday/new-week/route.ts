import { NextResponse } from "next/server";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { errorResponse } from "@/lib/server/http";
import { startNewWeek } from "@/lib/server/domain/board-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await startNewWeek({
      householdSlug: session.householdId,
      actorUserId: session.userId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}

