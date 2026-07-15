import bcrypt from "bcryptjs";
import { CoinLedgerType, KidsScreen, Prisma, RedemptionStatus, StarStatus } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { getCurrentDayIndex, getWeekStart } from "@/lib/server/domain/week";
import { DomainError, getBoardState } from "@/lib/server/domain/board-service";

export interface AdminChoreItem {
  id: string;
  childId: string;
  slug: string;
  label: string;
  icon: string;
  sortOrder: number;
  active: boolean;
}

export interface AdminRewardItem {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  sortOrder: number;
  active: boolean;
}

export interface AdminAuditEvent {
  id: string;
  actorType: "PARENT" | "KID" | "SYSTEM";
  actorId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: number;
}

export interface AdminReportingSummaryChild {
  childId: string;
  name: string;
  currentBalance: number;
  claimedStars: number;
  redemptionsRequested: number;
  redemptionsFulfilled: number;
  coinsSpent: number;
  coinsEarnedFromStars: number;
  coinsEarnedFromInterest: number;
}

export interface AdminReportingSummary {
  generatedAt: number;
  totals: {
    claimedStars: number;
    redemptionsRequested: number;
    redemptionsFulfilled: number;
    pendingRedemptions: number;
    coinsSpent: number;
    coinsEarnedFromStars: number;
    coinsEarnedFromInterest: number;
    netCoinDelta: number;
  };
  children: AdminReportingSummaryChild[];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function slugify(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || "item";
}

function resolveUniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

async function getHouseholdOrThrow(householdSlug: string) {
  const household = await prisma.household.findUnique({
    where: { slug: householdSlug },
    select: { id: true, slug: true, currentDay: true, currentWeekStart: true, interestRate: true, paydayDay: true },
  });

  if (!household) {
    throw new DomainError("Household not found", "NOT_FOUND", 404);
  }

  return household;
}

export async function getAdminChores(householdSlug: string): Promise<AdminChoreItem[]> {
  const household = await getHouseholdOrThrow(householdSlug);

  const templates = await prisma.choreTemplate.findMany({
    where: {
      householdId: household.id,
      isBonus: false,
      active: true,
      archivedAt: null,
    },
    include: {
      child: {
        select: { slug: true },
      },
    },
    orderBy: [{ child: { createdAt: "asc" } }, { sortOrder: "asc" }],
  });

  return templates.map((template) => ({
    id: template.id,
    childId: template.child.slug,
    slug: template.slug,
    label: template.label,
    icon: template.icon,
    sortOrder: template.sortOrder,
    active: template.active,
  }));
}

function buildNormalizedOrder<T extends string>(requested: string[], existing: T[]): T[] {
  const known = new Set(existing);
  const requestedKnown: T[] = [];
  const seen = new Set<string>();

  requested.forEach((value) => {
    if (!known.has(value as T) || seen.has(value)) return;
    seen.add(value);
    requestedKnown.push(value as T);
  });

  const missing = existing.filter((value) => !seen.has(value));
  return [...requestedKnown, ...missing];
}

export async function createAdminChild({
  householdSlug,
  name,
  age,
  avatar,
  accent,
  pin,
}: {
  householdSlug: string;
  name: string;
  age: number;
  avatar: string;
  accent: string;
  pin?: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);
  const weekStart = new Date(household.currentWeekStart);

  await prisma.$transaction(async (tx) => {
    const existingChildren = await tx.child.findMany({
      where: { householdId: household.id },
      select: { id: true, slug: true, pinHash: true },
      orderBy: { createdAt: "asc" },
    });

    const childSlug = resolveUniqueSlug(slugify(name), new Set(existingChildren.map((child) => child.slug)));
    if (!pin && !existingChildren[0]) {
      throw new DomainError("A shared kid PIN is required for the first child.", "PIN_REQUIRED", 400);
    }
    const pinHash = pin ? await bcrypt.hash(pin, 10) : existingChildren[0].pinHash;

    const child = await tx.child.create({
      data: {
        householdId: household.id,
        slug: childSlug,
        name: normalizeText(name),
        age,
        avatar: normalizeText(avatar),
        accent: normalizeText(accent),
        coins: 0,
        pinHash,
      },
      select: { id: true, slug: true },
    });

    const sourceChildId = existingChildren[0]?.id;
    const sourceTemplates = sourceChildId
      ? await tx.choreTemplate.findMany({
          where: { childId: sourceChildId, active: true, archivedAt: null },
          select: { slug: true, label: true, icon: true, isBonus: true, sortOrder: true, active: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    const templatesToClone =
      sourceTemplates.length > 0
        ? sourceTemplates
        : [{ slug: "bonus", label: "Bonus", icon: "🌟", isBonus: true, sortOrder: 0, active: true }];

    for (const template of templatesToClone) {
      const createdTemplate = await tx.choreTemplate.create({
        data: {
          householdId: household.id,
          childId: child.id,
          slug: template.slug,
          label: template.label,
          icon: template.icon,
          isBonus: template.isBonus,
          sortOrder: template.sortOrder,
          active: template.active,
        },
        select: { id: true },
      });

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        await tx.choreDayStatus.create({
          data: {
            householdId: household.id,
            childId: child.id,
            choreTemplateId: createdTemplate.id,
            weekStart,
            dayIndex,
            status: dayIndex <= household.currentDay ? StarStatus.EMPTY : StarStatus.FUTURE,
          },
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_CREATE_CHILD",
        payload: {
          childId: child.slug,
          name: normalizeText(name),
          age,
          avatar: normalizeText(avatar),
          accent: normalizeText(accent),
        },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function createAdminChore({
  householdSlug,
  childId,
  label,
  icon,
}: {
  householdSlug: string;
  childId: string;
  label: string;
  icon: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);
  const weekStart = new Date(household.currentWeekStart);

  await prisma.$transaction(async (tx) => {
    const child = await tx.child.findUnique({
      where: {
        householdId_slug: {
          householdId: household.id,
          slug: childId,
        },
      },
      select: { id: true, slug: true },
    });

    if (!child) {
      throw new DomainError("Child not found", "NOT_FOUND", 404);
    }

    const existing = await tx.choreTemplate.findMany({
      where: { childId: child.id, isBonus: false },
      select: { slug: true, sortOrder: true, active: true, archivedAt: true },
      orderBy: { sortOrder: "asc" },
    });

    const nextSlug = resolveUniqueSlug(slugify(label), new Set(existing.map((row) => row.slug)));
    const nextSortOrder = existing.filter((row) => row.active && !row.archivedAt).length;

    const template = await tx.choreTemplate.create({
      data: {
        householdId: household.id,
        childId: child.id,
        slug: nextSlug,
        label: normalizeText(label),
        icon: normalizeText(icon),
        isBonus: false,
        active: true,
        sortOrder: nextSortOrder,
      },
      select: { id: true },
    });

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      await tx.choreDayStatus.create({
        data: {
          householdId: household.id,
          childId: child.id,
          choreTemplateId: template.id,
          weekStart,
          dayIndex,
          status: dayIndex <= household.currentDay ? StarStatus.EMPTY : StarStatus.FUTURE,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_CREATE_CHORE",
        payload: { childId: child.slug, label: normalizeText(label), icon: normalizeText(icon), slug: nextSlug },
      },
    });
  });

  return getAdminChores(householdSlug);
}

export async function createSharedAdminChore({ householdSlug, label, icon }: { householdSlug: string; label: string; icon: string }) {
  const household = await getHouseholdOrThrow(householdSlug);
  const weekStart = new Date(household.currentWeekStart);

  await prisma.$transaction(async (tx) => {
    const [children, existing] = await Promise.all([
      tx.child.findMany({ where: { householdId: household.id }, select: { id: true, slug: true } }),
      tx.choreTemplate.findMany({ where: { householdId: household.id, isBonus: false }, select: { slug: true, sortOrder: true } }),
    ]);
    const slug = resolveUniqueSlug(slugify(label), new Set(existing.map((entry) => entry.slug)));
    const sortOrder = Math.max(-1, ...existing.map((entry) => entry.sortOrder)) + 1;
    const templates = await Promise.all(
      children.map((child) =>
        tx.choreTemplate.create({
          data: { householdId: household.id, childId: child.id, slug, label: normalizeText(label), icon: normalizeText(icon), isBonus: false, active: true, sortOrder },
          select: { id: true, childId: true },
        }),
      ),
    );
    await Promise.all(
      templates.map((template) =>
        tx.choreDayStatus.createMany({
          data: Array.from({ length: 7 }, (_, dayIndex) => ({
            householdId: household.id,
            childId: template.childId,
            choreTemplateId: template.id,
            weekStart,
            dayIndex,
            status: dayIndex <= household.currentDay ? StarStatus.EMPTY : StarStatus.FUTURE,
          })),
        }),
      ),
    );
    await tx.auditEvent.create({
      data: { householdId: household.id, actorType: "PARENT", eventType: "ADMIN_CREATE_SHARED_CHORE", payload: { slug, label: normalizeText(label), icon: normalizeText(icon) } },
    });
  });

  return getAdminChores(householdSlug);
}

export async function updateSharedAdminChore({
  householdSlug,
  slug,
  label,
  icon,
  archive,
}: {
  householdSlug: string;
  slug: string;
  label?: string;
  icon?: string;
  archive?: boolean;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const result = await tx.choreTemplate.updateMany({
      where: { householdId: household.id, slug, isBonus: false, archivedAt: null },
      data: {
        ...(typeof label === "string" ? { label: normalizeText(label) } : {}),
        ...(typeof icon === "string" ? { icon: normalizeText(icon) } : {}),
        ...(archive ? { active: false, archivedAt: new Date() } : {}),
      },
    });
    if (result.count === 0) throw new DomainError("Chore not found", "NOT_FOUND", 404);
    await tx.auditEvent.create({
      data: { householdId: household.id, actorType: "PARENT", eventType: archive ? "ADMIN_ARCHIVE_SHARED_CHORE" : "ADMIN_UPDATE_SHARED_CHORE", payload: { slug, label, icon } },
    });
  });

  return getAdminChores(householdSlug);
}

export async function reorderAdminChores({
  householdSlug,
  orderedSlugs,
}: {
  householdSlug: string;
  orderedSlugs: string[];
}) {
  if (orderedSlugs.length === 0) {
    throw new DomainError("Ordered slugs are required", "INVALID_INPUT", 400);
  }

  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const templates = await tx.choreTemplate.findMany({
      where: {
        householdId: household.id,
        isBonus: false,
        active: true,
        archivedAt: null,
      },
      select: {
        id: true,
        childId: true,
        slug: true,
        sortOrder: true,
      },
      orderBy: [{ child: { createdAt: "asc" } }, { sortOrder: "asc" }],
    });

    if (templates.length === 0) return;

    const firstSeen = new Map<string, number>();
    templates.forEach((template) => {
      if (firstSeen.has(template.slug)) return;
      firstSeen.set(template.slug, template.sortOrder);
    });

    const existingSlugs = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([slug]) => slug);
    const normalizedOrder = buildNormalizedOrder(orderedSlugs, existingSlugs);
    const orderIndex = new Map(normalizedOrder.map((slug, index) => [slug, index]));
    const byChild = new Map<string, typeof templates>();

    templates.forEach((template) => {
      const childTemplates = byChild.get(template.childId) ?? [];
      childTemplates.push(template);
      byChild.set(template.childId, childTemplates);
    });

    for (const childTemplates of byChild.values()) {
      const sortedForChild = [...childTemplates].sort((left, right) => {
        const leftIndex = orderIndex.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = orderIndex.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.sortOrder - right.sortOrder;
      });

      await Promise.all(
        sortedForChild.map((template, index) =>
          tx.choreTemplate.update({
            where: { id: template.id },
            data: { sortOrder: index },
          }),
        ),
      );
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_REORDER_CHORES",
        payload: { orderedSlugs: normalizedOrder },
      },
    });
  });

  return getAdminChores(householdSlug);
}

async function reorderChoresForChild(
  tx: Prisma.TransactionClient,
  childId: string,
  choreId: string,
  targetSortOrder: number,
) {
  const chores = await tx.choreTemplate.findMany({
    where: { childId, isBonus: false, active: true, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  const currentIndex = chores.findIndex((chore) => chore.id === choreId);
  if (currentIndex < 0) {
    throw new DomainError("Chore not found", "NOT_FOUND", 404);
  }

  const [moved] = chores.splice(currentIndex, 1);
  const clampedIndex = Math.max(0, Math.min(targetSortOrder, chores.length));
  chores.splice(clampedIndex, 0, moved);

  await Promise.all(
    chores.map((chore, index) =>
      tx.choreTemplate.update({
        where: { id: chore.id },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function updateAdminChore({
  householdSlug,
  choreId,
  label,
  icon,
  active,
  sortOrder,
}: {
  householdSlug: string;
  choreId: string;
  label?: string;
  icon?: string;
  active?: boolean;
  sortOrder?: number;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const chore = await tx.choreTemplate.findFirst({
      where: {
        id: choreId,
        householdId: household.id,
        isBonus: false,
        archivedAt: null,
      },
      select: { id: true, childId: true, slug: true, label: true, icon: true, active: true },
    });

    if (!chore) {
      throw new DomainError("Chore not found", "NOT_FOUND", 404);
    }

    await tx.choreTemplate.update({
      where: { id: chore.id },
      data: {
        ...(typeof label === "string" ? { label: normalizeText(label) } : {}),
        ...(typeof icon === "string" ? { icon: normalizeText(icon) } : {}),
        ...(typeof active === "boolean" ? { active } : {}),
      },
    });

    if (typeof sortOrder === "number") {
      await reorderChoresForChild(tx, chore.childId, chore.id, sortOrder);
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_UPDATE_CHORE",
        payload: {
          choreId: chore.id,
          slug: chore.slug,
          label,
          icon,
          active,
          sortOrder,
        },
      },
    });
  });

  return getAdminChores(householdSlug);
}

export async function deleteAdminChore({
  householdSlug,
  choreId,
}: {
  householdSlug: string;
  choreId: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const chore = await tx.choreTemplate.findFirst({
      where: {
        id: choreId,
        householdId: household.id,
        isBonus: false,
        archivedAt: null,
      },
      select: { id: true, childId: true, slug: true, label: true },
    });

    if (!chore) {
      throw new DomainError("Chore not found", "NOT_FOUND", 404);
    }

    await tx.choreTemplate.update({
      where: { id: chore.id },
      data: {
        active: false,
        archivedAt: new Date(),
      },
    });

    const remaining = await tx.choreTemplate.findMany({
      where: { childId: chore.childId, isBonus: false, active: true, archivedAt: null },
      select: { id: true },
      orderBy: { sortOrder: "asc" },
    });

    await Promise.all(
      remaining.map((entry, index) =>
        tx.choreTemplate.update({
          where: { id: entry.id },
          data: { sortOrder: index },
        }),
      ),
    );

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_DELETE_CHORE",
        payload: { choreId: chore.id, slug: chore.slug, label: chore.label },
      },
    });
  });

  return getAdminChores(householdSlug);
}

export async function getAdminRewards(householdSlug: string): Promise<AdminRewardItem[]> {
  const household = await getHouseholdOrThrow(householdSlug);

  const rewards = await prisma.rewardItem.findMany({
    where: { householdId: household.id, active: true, archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });

  return rewards.map((reward) => ({
    id: reward.id,
    slug: reward.slug,
    name: reward.name,
    icon: reward.icon,
    description: reward.description,
    cost: reward.cost,
    sortOrder: reward.sortOrder,
    active: reward.active,
  }));
}

export async function reorderAdminRewards({
  householdSlug,
  orderedRewardIds,
}: {
  householdSlug: string;
  orderedRewardIds: string[];
}) {
  if (orderedRewardIds.length === 0) {
    throw new DomainError("Ordered reward ids are required", "INVALID_INPUT", 400);
  }

  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const rewards = await tx.rewardItem.findMany({
      where: { householdId: household.id, active: true, archivedAt: null },
      select: { id: true },
      orderBy: { sortOrder: "asc" },
    });

    if (rewards.length === 0) return;

    const existingIds = rewards.map((reward) => reward.id);
    const normalizedOrder = buildNormalizedOrder(orderedRewardIds, existingIds);

    await Promise.all(
      normalizedOrder.map((rewardId, index) =>
        tx.rewardItem.update({
          where: { id: rewardId },
          data: { sortOrder: index },
        }),
      ),
    );

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_REORDER_REWARDS",
        payload: { orderedRewardIds: normalizedOrder },
      },
    });
  });

  return getAdminRewards(householdSlug);
}

export async function createAdminReward({
  householdSlug,
  name,
  icon,
  description,
  cost,
}: {
  householdSlug: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.rewardItem.findMany({
      where: { householdId: household.id },
      select: { slug: true, sortOrder: true, active: true, archivedAt: true },
      orderBy: { sortOrder: "asc" },
    });

    const slug = resolveUniqueSlug(slugify(name), new Set(existing.map((reward) => reward.slug)));
    const nextSortOrder = existing.filter((reward) => reward.active && !reward.archivedAt).length;

    await tx.rewardItem.create({
      data: {
        householdId: household.id,
        slug,
        name: normalizeText(name),
        icon: normalizeText(icon),
        description: normalizeText(description),
        cost,
        active: true,
        sortOrder: nextSortOrder,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_CREATE_REWARD",
        payload: { slug, name: normalizeText(name), cost },
      },
    });
  });

  return getAdminRewards(householdSlug);
}

async function reorderRewards(
  tx: Prisma.TransactionClient,
  householdId: string,
  rewardId: string,
  targetSortOrder: number,
) {
  const rewards = await tx.rewardItem.findMany({
    where: { householdId, active: true, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  const currentIndex = rewards.findIndex((reward) => reward.id === rewardId);
  if (currentIndex < 0) {
    throw new DomainError("Reward not found", "NOT_FOUND", 404);
  }

  const [moved] = rewards.splice(currentIndex, 1);
  const clampedIndex = Math.max(0, Math.min(targetSortOrder, rewards.length));
  rewards.splice(clampedIndex, 0, moved);

  await Promise.all(
    rewards.map((reward, index) =>
      tx.rewardItem.update({
        where: { id: reward.id },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function updateAdminReward({
  householdSlug,
  rewardId,
  name,
  icon,
  description,
  cost,
  active,
  sortOrder,
}: {
  householdSlug: string;
  rewardId: string;
  name?: string;
  icon?: string;
  description?: string;
  cost?: number;
  active?: boolean;
  sortOrder?: number;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const reward = await tx.rewardItem.findFirst({
      where: { id: rewardId, householdId: household.id, archivedAt: null },
      select: { id: true, slug: true },
    });

    if (!reward) {
      throw new DomainError("Reward not found", "NOT_FOUND", 404);
    }

    await tx.rewardItem.update({
      where: { id: reward.id },
      data: {
        ...(typeof name === "string" ? { name: normalizeText(name) } : {}),
        ...(typeof icon === "string" ? { icon: normalizeText(icon) } : {}),
        ...(typeof description === "string" ? { description: normalizeText(description) } : {}),
        ...(typeof cost === "number" ? { cost } : {}),
        ...(typeof active === "boolean" ? { active } : {}),
      },
    });

    if (typeof sortOrder === "number") {
      await reorderRewards(tx, household.id, reward.id, sortOrder);
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_UPDATE_REWARD",
        payload: { rewardId: reward.id, slug: reward.slug, name, cost, active, sortOrder },
      },
    });
  });

  return getAdminRewards(householdSlug);
}

export async function deleteAdminReward({
  householdSlug,
  rewardId,
}: {
  householdSlug: string;
  rewardId: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const reward = await tx.rewardItem.findFirst({
      where: { id: rewardId, householdId: household.id, archivedAt: null },
      select: { id: true, slug: true, name: true },
    });

    if (!reward) {
      throw new DomainError("Reward not found", "NOT_FOUND", 404);
    }

    await tx.rewardItem.update({
      where: { id: reward.id },
      data: {
        active: false,
        archivedAt: new Date(),
      },
    });

    const remaining = await tx.rewardItem.findMany({
      where: { householdId: household.id, active: true, archivedAt: null },
      select: { id: true },
      orderBy: { sortOrder: "asc" },
    });

    await Promise.all(
      remaining.map((entry, index) =>
        tx.rewardItem.update({
          where: { id: entry.id },
          data: { sortOrder: index },
        }),
      ),
    );

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_DELETE_REWARD",
        payload: { rewardId: reward.id, slug: reward.slug, name: reward.name },
      },
    });
  });

  return getAdminRewards(householdSlug);
}

export async function updateAdminChildProfile({
  householdSlug,
  childSlug,
  name,
  age,
  avatar,
  accent,
}: {
  householdSlug: string;
  childSlug: string;
  name?: string;
  age?: number;
  avatar?: string;
  accent?: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const child = await tx.child.findUnique({
      where: {
        householdId_slug: {
          householdId: household.id,
          slug: childSlug,
        },
      },
      select: { id: true, slug: true },
    });

    if (!child) {
      throw new DomainError("Child not found", "NOT_FOUND", 404);
    }

    await tx.child.update({
      where: { id: child.id },
      data: {
        ...(typeof name === "string" ? { name: normalizeText(name) } : {}),
        ...(typeof age === "number" ? { age } : {}),
        ...(typeof avatar === "string" ? { avatar: normalizeText(avatar) } : {}),
        ...(typeof accent === "string" ? { accent: normalizeText(accent) } : {}),
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_UPDATE_CHILD",
        payload: {
          childId: child.slug,
          name,
          age,
          avatar,
          accent,
        },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function deleteAdminChild({
  householdSlug,
  childSlug,
}: {
  householdSlug: string;
  childSlug: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    const children = await tx.child.findMany({
      where: { householdId: household.id },
      select: { id: true, slug: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (children.length <= 1) {
      throw new DomainError("At least one child is required.", "VALIDATION_ERROR", 400);
    }

    const child = children.find((entry) => entry.slug === childSlug);
    if (!child) {
      throw new DomainError("Child not found", "NOT_FOUND", 404);
    }

    await tx.child.delete({ where: { id: child.id } });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_DELETE_CHILD",
        payload: { childId: child.slug, name: child.name },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function updateAdminHouseholdSettings({
  householdSlug,
  interestRate,
  paydayDay,
  kidPin,
}: {
  householdSlug: string;
  interestRate?: number;
  paydayDay?: number;
  kidPin?: string;
}) {
  const household = await getHouseholdOrThrow(householdSlug);

  await prisma.$transaction(async (tx) => {
    await tx.household.update({
      where: { id: household.id },
      data: {
        ...(typeof interestRate === "number" ? { interestRate } : {}),
        ...(typeof paydayDay === "number" ? { paydayDay } : {}),
      },
    });

    if (typeof kidPin === "string") {
      await tx.child.updateMany({
        where: { householdId: household.id },
        data: {
          pinHash: await bcrypt.hash(kidPin, 10),
          pinFailCount: 0,
          pinLockedUntil: null,
          lastPinAttemptAt: null,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_UPDATE_HOUSEHOLD_SETTINGS",
        payload: { interestRate, paydayDay, kidPinUpdated: typeof kidPin === "string" },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function resetAdminHouseholdState(householdSlug: string) {
  const household = await getHouseholdOrThrow(householdSlug);
  const nextWeekStart = getWeekStart();
  const nextCurrentDay = getCurrentDayIndex();
  const resetAt = new Date();

  await prisma.$transaction(async (tx) => {
    const children = await tx.child.findMany({
      where: { householdId: household.id },
      select: { id: true, slug: true, coins: true },
    });

    const templates = await tx.choreTemplate.findMany({
      where: { householdId: household.id, active: true, archivedAt: null },
      select: { id: true, childId: true },
    });

    const clearedRedemptions = await tx.redemption.deleteMany({
      where: { householdId: household.id },
    });

    await Promise.all(
      children.map((child) =>
        tx.child.update({
          where: { id: child.id },
          data: { coins: 0 },
        }),
      ),
    );

    for (const child of children) {
      if (child.coins === 0) continue;
      await tx.coinLedgerEntry.create({
        data: {
          householdId: household.id,
          childId: child.id,
          movementType: CoinLedgerType.ADMIN_RESET,
          delta: -child.coins,
          balanceBefore: child.coins,
          balanceAfter: 0,
          weekStart: nextWeekStart,
          metadata: { reason: "safe_reset_household" },
        },
      });
    }

    await tx.household.update({
      where: { id: household.id },
      data: {
        currentWeekStart: nextWeekStart,
        currentDay: nextCurrentDay,
        kidsScreen: KidsScreen.ACTIVE,
      },
    });

    await tx.choreDayStatus.deleteMany({
      where: {
        householdId: household.id,
        weekStart: nextWeekStart,
      },
    });

    if (templates.length > 0) {
      await tx.choreDayStatus.createMany({
        data: templates.flatMap((template) =>
          Array.from({ length: 7 }).map((_, dayIndex) => ({
            householdId: household.id,
            childId: template.childId,
            choreTemplateId: template.id,
            weekStart: nextWeekStart,
            dayIndex,
            status: dayIndex <= nextCurrentDay ? StarStatus.EMPTY : StarStatus.FUTURE,
          })),
        ),
        skipDuplicates: true,
      });
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "ADMIN_RESET_HOUSEHOLD",
        payload: {
          currentWeekStart: nextWeekStart.toISOString(),
          clearedRedemptions: clearedRedemptions.count,
          childCount: children.length,
          resetAt: resetAt.toISOString(),
        },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function getAdminReportingSummary(householdSlug: string): Promise<AdminReportingSummary> {
  const household = await getHouseholdOrThrow(householdSlug);

  const [children, claimedStars, redemptionGroups, ledgerGroups] = await Promise.all([
    prisma.child.findMany({
      where: { householdId: household.id },
      select: { id: true, slug: true, name: true, coins: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.choreDayStatus.groupBy({
      by: ["childId"],
      where: {
        householdId: household.id,
        status: StarStatus.CLAIMED,
      },
      _count: { _all: true },
    }),
    prisma.redemption.groupBy({
      by: ["childId", "status"],
      where: {
        householdId: household.id,
      },
      _count: { _all: true },
      _sum: { costAtRequest: true },
    }),
    prisma.coinLedgerEntry.groupBy({
      by: ["childId", "movementType"],
      where: {
        householdId: household.id,
      },
      _sum: { delta: true },
    }),
  ]);

  const claimedStarsByChild = new Map<string, number>();
  claimedStars.forEach((row) => {
    claimedStarsByChild.set(row.childId, row._count._all ?? 0);
  });

  const redemptionStatsByChild = new Map<string, { requested: number; fulfilled: number; spent: number; pending: number }>();
  redemptionGroups.forEach((row) => {
    const current = redemptionStatsByChild.get(row.childId) ?? { requested: 0, fulfilled: 0, spent: 0, pending: 0 };
    const count = row._count._all ?? 0;
    current.requested += count;
    if (row.status === RedemptionStatus.FULFILLED) {
      current.fulfilled += count;
    }
    if (row.status === RedemptionStatus.PENDING) {
      current.pending += count;
    }
    if (typeof row._sum.costAtRequest === "number") {
      current.spent += row._sum.costAtRequest;
    }
    redemptionStatsByChild.set(row.childId, current);
  });

  const ledgerStatsByChild = new Map<string, { stars: number; interest: number }>();
  ledgerGroups.forEach((row) => {
    const current = ledgerStatsByChild.get(row.childId) ?? { stars: 0, interest: 0 };
    const delta = row._sum.delta ?? 0;
    if (row.movementType === CoinLedgerType.PAYDAY_STARS) {
      current.stars += delta;
    }
    if (row.movementType === CoinLedgerType.PAYDAY_INTEREST) {
      current.interest += delta;
    }
    ledgerStatsByChild.set(row.childId, current);
  });

  const summaryChildren: AdminReportingSummaryChild[] = children.map((child) => {
    const claimed = claimedStarsByChild.get(child.id) ?? 0;
    const redemptionStats = redemptionStatsByChild.get(child.id) ?? { requested: 0, fulfilled: 0, spent: 0, pending: 0 };
    const ledgerStats = ledgerStatsByChild.get(child.id) ?? { stars: 0, interest: 0 };

    return {
      childId: child.slug,
      name: child.name,
      currentBalance: child.coins,
      claimedStars: claimed,
      redemptionsRequested: redemptionStats.requested,
      redemptionsFulfilled: redemptionStats.fulfilled,
      coinsSpent: redemptionStats.spent,
      coinsEarnedFromStars: ledgerStats.stars,
      coinsEarnedFromInterest: ledgerStats.interest,
    };
  });

  const totals = summaryChildren.reduce(
    (acc, child) => {
      acc.claimedStars += child.claimedStars;
      acc.redemptionsRequested += child.redemptionsRequested;
      acc.redemptionsFulfilled += child.redemptionsFulfilled;
      acc.coinsSpent += child.coinsSpent;
      acc.coinsEarnedFromStars += child.coinsEarnedFromStars;
      acc.coinsEarnedFromInterest += child.coinsEarnedFromInterest;
      return acc;
    },
    {
      claimedStars: 0,
      redemptionsRequested: 0,
      redemptionsFulfilled: 0,
      pendingRedemptions: 0,
      coinsSpent: 0,
      coinsEarnedFromStars: 0,
      coinsEarnedFromInterest: 0,
      netCoinDelta: 0,
    },
  );

  totals.pendingRedemptions = totals.redemptionsRequested - totals.redemptionsFulfilled;
  totals.netCoinDelta = totals.coinsEarnedFromStars + totals.coinsEarnedFromInterest - totals.coinsSpent;

  return {
    generatedAt: Date.now(),
    totals,
    children: summaryChildren,
  };
}

export async function getAdminAuditEvents(householdSlug: string): Promise<AdminAuditEvent[]> {
  const household = await getHouseholdOrThrow(householdSlug);

  const events = await prisma.auditEvent.findMany({
    where: { householdId: household.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      actorType: true,
      actorId: true,
      eventType: true,
      payload: true,
      createdAt: true,
    },
  });

  return events.map((event) => ({
    id: event.id,
    actorType: event.actorType,
    actorId: event.actorId,
    eventType: event.eventType,
    payload: event.payload,
    createdAt: event.createdAt.getTime(),
  }));
}
