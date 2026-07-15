import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { createAdminChore, deleteAdminChore, getAdminChores, updateAdminChore } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const createSchema = z.object({
  childId: z.string().min(1),
  label: z.string().min(1).max(60),
  icon: z.string().min(1).max(12),
});

const patchSchema = z.object({
  choreId: z.string().min(1),
  label: z.string().min(1).max(60).optional(),
  icon: z.string().min(1).max(12).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(200).optional(),
});

const deleteSchema = z.object({
  choreId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [] });
    }

    const chores = await getAdminChores(session.householdId);
    return NextResponse.json({ chores });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [] });
    }

    const body = createSchema.parse(await request.json());
    const chores = await createAdminChore({
      householdSlug: session.householdId,
      childId: body.childId,
      label: body.label,
      icon: body.icon,
    });

    return NextResponse.json({ chores });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [] });
    }

    const body = patchSchema.parse(await request.json());
    const chores = await updateAdminChore({
      householdSlug: session.householdId,
      choreId: body.choreId,
      label: body.label,
      icon: body.icon,
      active: body.active,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ chores });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ chores: [] });
    }

    const body = deleteSchema.parse(await request.json());
    const chores = await deleteAdminChore({
      householdSlug: session.householdId,
      choreId: body.choreId,
    });

    return NextResponse.json({ chores });
  } catch (error) {
    return errorResponse(error);
  }
}
