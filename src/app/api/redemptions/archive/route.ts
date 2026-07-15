import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { archiveRedemption } from "@/lib/server/domain/board-service";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  redemptionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    const body = bodySchema.parse(await request.json());

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await archiveRedemption({
      householdSlug: session.householdId,
      redemptionId: body.redemptionId,
      actorUserId: session.userId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
