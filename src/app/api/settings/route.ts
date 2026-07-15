import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialState } from "@/lib/chore-board/defaults";
import { toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { updateSettings } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  interestRate: z.number().int().min(0).max(100).optional(),
  paydayDay: z.number().int().min(0).max(6).optional(),
  sounds: z.boolean().optional(),
  animations: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    const body = bodySchema.parse(await request.json());

    if (session.mode === "demo") {
      return NextResponse.json({ state: toLiveBoardPayloadFromState(createInitialState()) });
    }

    const state = await updateSettings({
      householdSlug: session.householdId,
      interestRate: body.interestRate,
      paydayDay: body.paydayDay,
      sounds: body.sounds,
      animations: body.animations,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
