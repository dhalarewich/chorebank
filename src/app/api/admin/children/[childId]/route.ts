import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { deleteAdminChild, updateAdminChildProfile } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().min(1).max(40).optional(),
  age: z.number().int().min(1).max(18).optional(),
  avatar: z.string().min(1).max(12).optional(),
  accent: z.string().min(1).max(24).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ childId: string }> }) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const { childId } = await context.params;
    const body = bodySchema.parse(await request.json());

    const state = await updateAdminChildProfile({
      householdSlug: session.householdId,
      childSlug: childId,
      name: body.name,
      age: body.age,
      avatar: body.avatar,
      accent: body.accent,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ childId: string }> }) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const { childId } = await context.params;
    const state = await deleteAdminChild({
      householdSlug: session.householdId,
      childSlug: childId,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
