import { NextResponse } from "next/server";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { resetAdminHouseholdState } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const state = await resetAdminHouseholdState(session.householdId);
    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
