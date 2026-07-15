import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { createSharedAdminChore, updateSharedAdminChore } from "@/lib/server/domain/admin-service";
import { getBoardState } from "@/lib/server/domain/board-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const createSchema = z.object({ label: z.string().min(1).max(60), icon: z.string().min(1).max(12) });
const patchSchema = z.object({ slug: z.string().min(1), label: z.string().min(1).max(60).optional(), icon: z.string().min(1).max(12).optional(), archive: z.boolean().optional() });

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);
    if (session.mode === "demo") return NextResponse.json({ chores: [] });
    const body = createSchema.parse(await request.json());
    const chores = await createSharedAdminChore({ householdSlug: session.householdId, ...body });
    return NextResponse.json({ chores, state: await getBoardState(session.householdId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);
    if (session.mode === "demo") return NextResponse.json({ chores: [] });
    const body = patchSchema.parse(await request.json());
    const chores = await updateSharedAdminChore({ householdSlug: session.householdId, ...body });
    return NextResponse.json({ chores, state: await getBoardState(session.householdId) });
  } catch (error) {
    return errorResponse(error);
  }
}
