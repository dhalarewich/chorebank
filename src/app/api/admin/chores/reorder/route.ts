import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { reorderAdminChores } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const reorderSchema = z.object({
  orderedSlugs: z.array(z.string().min(1)).min(1).max(400),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [] });
    }

    const body = reorderSchema.parse(await request.json());
    const chores = await reorderAdminChores({
      householdSlug: session.householdId,
      orderedSlugs: body.orderedSlugs,
    });

    return NextResponse.json({ chores });
  } catch (error) {
    return errorResponse(error);
  }
}
