import { NextResponse } from "next/server";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { getAdminAuditEvents } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ events: [] });
    }

    const events = await getAdminAuditEvents(session.householdId);
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}
