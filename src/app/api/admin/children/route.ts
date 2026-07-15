import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { createAdminChild } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().min(1).max(40),
  age: z.number().int().min(1).max(18),
  avatar: z.string().min(1).max(12),
  accent: z.string().min(1).max(24),
});

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const body = postSchema.parse(await request.json());
    const state = await createAdminChild({
      householdSlug: session.householdId,
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
