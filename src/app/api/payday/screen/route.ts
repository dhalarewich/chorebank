import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireSession } from "@/lib/server/auth/guards";
import { setKidsScreenState } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  screen: z.enum(["celebration", "closed"]),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    const body = bodySchema.parse(await request.json());

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await setKidsScreenState({
      householdSlug: session.householdId,
      screen: body.screen,
      actorType: session.actor === "kid" ? "KID" : "PARENT",
      actorId: session.actor === "kid" ? session.childId : session.userId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}

