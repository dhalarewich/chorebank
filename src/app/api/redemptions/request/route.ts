import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { DomainError, requestRedemption } from "@/lib/server/domain/board-service";
import { requireKid, requireSession } from "@/lib/server/auth/guards";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  childId: z.string().min(1),
  rewardId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireKid(session);
    const body = bodySchema.parse(await request.json());

    if (session.mode === "live" && session.childId && session.childId !== body.childId) {
      throw new DomainError("Kids can only redeem for themselves", "FORBIDDEN", 403);
    }

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await requestRedemption({
      householdSlug: session.householdId,
      childId: body.childId,
      rewardId: body.rewardId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
