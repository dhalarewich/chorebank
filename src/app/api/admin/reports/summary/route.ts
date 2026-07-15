import { NextResponse } from "next/server";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { getAdminReportingSummary } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ summary: null });
    }

    const summary = await getAdminReportingSummary(session.householdId);
    return NextResponse.json({ summary });
  } catch (error) {
    return errorResponse(error);
  }
}
