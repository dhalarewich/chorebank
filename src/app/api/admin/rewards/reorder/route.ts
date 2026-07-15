import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { reorderAdminRewards } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const reorderSchema = z.object({
  orderedRewardIds: z.array(z.string().min(1)).min(1).max(400),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ rewards: [] });
    }

    const body = reorderSchema.parse(await request.json());
    const rewards = await reorderAdminRewards({
      householdSlug: session.householdId,
      orderedRewardIds: body.orderedRewardIds,
    });

    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}
