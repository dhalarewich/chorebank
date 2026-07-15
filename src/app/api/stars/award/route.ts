import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { awardStar } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  childId: z.string().min(1),
  rowId: z.string().min(1),
  day: z.number().int().min(0).max(6),
  isBonus: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    const body = bodySchema.parse(await request.json());

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await awardStar({
      householdSlug: session.householdId,
      childId: body.childId,
      rowId: body.rowId,
      day: body.day,
      isBonus: body.isBonus,
      actorUserId: session.userId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
