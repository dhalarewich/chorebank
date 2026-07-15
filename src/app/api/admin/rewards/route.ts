import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, requireSession } from "@/lib/server/auth/guards";
import { createAdminReward, deleteAdminReward, getAdminRewards, updateAdminReward } from "@/lib/server/domain/admin-service";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().min(1).max(12),
  description: z.string().min(1).max(200),
  cost: z.number().int().min(1).max(10000),
});

const patchSchema = z.object({
  rewardId: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  icon: z.string().min(1).max(12).optional(),
  description: z.string().min(1).max(200).optional(),
  cost: z.number().int().min(1).max(10000).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(200).optional(),
});

const deleteSchema = z.object({
  rewardId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ rewards: [] });
    }

    const rewards = await getAdminRewards(session.householdId);
    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ rewards: [] });
    }

    const body = createSchema.parse(await request.json());
    const rewards = await createAdminReward({
      householdSlug: session.householdId,
      name: body.name,
      icon: body.icon,
      description: body.description,
      cost: body.cost,
    });

    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ rewards: [] });
    }

    const body = patchSchema.parse(await request.json());
    const rewards = await updateAdminReward({
      householdSlug: session.householdId,
      rewardId: body.rewardId,
      name: body.name,
      icon: body.icon,
      description: body.description,
      cost: body.cost,
      active: body.active,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = requireSession(request);
    requireParent(session);

    if (session.mode === "demo") {
      return NextResponse.json({ rewards: [] });
    }

    const body = deleteSchema.parse(await request.json());
    const rewards = await deleteAdminReward({
      householdSlug: session.householdId,
      rewardId: body.rewardId,
    });

    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}
