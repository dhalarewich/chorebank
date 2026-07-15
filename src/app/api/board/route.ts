import { NextResponse } from "next/server";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireSession } from "@/lib/server/auth/guards";
import { getBoardState } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);

    if (session.mode === "demo") {
      return NextResponse.json({
        state: toLiveBoardPayloadFromState(createInitialState()),
        mode: "demo",
      });
    }

    const state = await getBoardState(session.householdId);
    return NextResponse.json({ state, mode: "live" });
  } catch (error) {
    return errorResponse(error);
  }
}
