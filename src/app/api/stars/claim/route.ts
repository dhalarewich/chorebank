import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireKid, requireSession } from "@/lib/server/auth/guards";
import { claimStar, DomainError } from "@/lib/server/domain/board-service";
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
    requireKid(session);
    const body = bodySchema.parse(await request.json());

    if (session.mode === "live" && session.childId && session.childId !== body.childId) {
      throw new DomainError("Kids can only claim their own stars", "FORBIDDEN", 403);
    }

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await claimStar({
      householdSlug: session.householdId,
      childId: body.childId,
      rowId: body.rowId,
      day: body.day,
      isBonus: body.isBonus,
      actorChildId: session.childId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
