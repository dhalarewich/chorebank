import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { updateAdminHouseholdSettings } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  interestRate: z.number().int().min(0).max(100).optional(),
  paydayDay: z.number().int().min(0).max(6).optional(),
  sharedKidPin: z
    .string()
    .regex(/^[0-9]{4,12}$/)
    .optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const body = bodySchema.parse(await request.json());
    const state = await updateAdminHouseholdSettings({
      householdSlug: session.householdId,
      interestRate: body.interestRate,
      paydayDay: body.paydayDay,
      kidPin: body.sharedKidPin,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
