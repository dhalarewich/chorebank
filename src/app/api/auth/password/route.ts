import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { changeParentPassword, DomainError } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);
    if (!session.userId) throw new DomainError("Authentication required", "UNAUTHENTICATED", 401);

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new DomainError("Current password and a 12+ character new password are required", "VALIDATION_ERROR", 400);
    await changeParentPassword({
      householdSlug: session.householdId,
      userId: session.userId,
      ...parsed.data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
