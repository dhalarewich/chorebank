import bcrypt from "bcryptjs";
import { CoinLedgerType, Prisma, RedemptionStatus, StarStatus } from "@prisma/client";
import { DAYS } from "@/lib/chore-board/defaults";
import { prisma } from "@/lib/server/prisma";
import { getCurrentDayIndex, getNextWeekStart, getWeekStart, normalizeWeekStart } from "@/lib/server/domain/week";
import { toAppKidsScreen, toAppStarStatus, toPrismaKidsScreen } from "@/lib/server/domain/mappers";
import type { AppState, Child, ChildId, RewardId, StarCellState } from "@/types/chore-board";
import type { LiveBoardPayload } from "@/types/live-api";

export class DomainError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "DOMAIN_ERROR", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toWeekKey(value: Date): Date {
  return normalizeWeekStart(value);
}

async function logCoinMovement(
  tx: Prisma.TransactionClient,
  {
    householdId,
    childId,
    movementType,
    delta,
    balanceBefore,
    balanceAfter,
    weekStart,
    sourceId,
    metadata,
  }: {
    householdId: string;
    childId: string;
    movementType: CoinLedgerType;
    delta: number;
    balanceBefore: number;
    balanceAfter: number;
    weekStart?: Date;
    sourceId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.coinLedgerEntry.create({
    data: {
      householdId,
      childId,
      movementType,
      delta,
      balanceBefore,
      balanceAfter,
      weekStart,
      sourceId,
      metadata,
    },
  });
}

async function maybeAdvanceCurrentDay(householdSlug: string) {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({
      where: { slug: householdSlug },
      select: { id: true, currentWeekStart: true, currentDay: true, kidsScreen: true, timeZone: true },
    });
    if (!household) return;
    if (household.kidsScreen !== "ACTIVE") return;

    const activeWeekStart = toWeekKey(household.currentWeekStart).getTime();
    const todayWeekStart = toWeekKey(getWeekStart(new Date(), household.timeZone)).getTime();
    if (activeWeekStart !== todayWeekStart) return;

    const todayIndex = getCurrentDayIndex(new Date(), household.timeZone);
    const weekStart = toWeekKey(household.currentWeekStart);

    await tx.choreDayStatus.updateMany({
      where: {
        householdId: household.id,
        weekStart,
        dayIndex: {
          lt: todayIndex,
        },
        status: StarStatus.FUTURE,
      },
      data: {
        status: StarStatus.EMPTY,
      },
    });

    await tx.choreDayStatus.updateMany({
      where: {
        householdId: household.id,
        weekStart,
        dayIndex: {
          gte: todayIndex,
        },
        status: StarStatus.EMPTY,
      },
      data: {
        status: StarStatus.FUTURE,
      },
    });

    if (todayIndex === household.currentDay) return;

    await tx.household.update({
      where: { id: household.id },
      data: { currentDay: todayIndex },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "SYSTEM",
        eventType: "ADVANCE_CURRENT_DAY",
        payload: { from: household.currentDay, to: todayIndex },
      },
    });
  });
}

function countClaimed(child: Child): number {
  let total = 0;
  child.chores.forEach((chore) => {
    chore.cells.forEach((status) => {
      if (status === "claimed") total += 1;
    });
  });
  child.bonus.forEach((status) => {
    if (status === "claimed") total += 1;
  });
  return total;
}

async function getHouseholdGraph(householdSlug: string) {
  const householdMeta = await prisma.household.findUnique({
    where: { slug: householdSlug },
    select: { id: true, currentWeekStart: true },
  });

  if (!householdMeta) {
    throw new DomainError("Household not found", "NOT_FOUND", 404);
  }

  const weekStart = toWeekKey(householdMeta.currentWeekStart);

  const household = await prisma.household.findUnique({
    where: { id: householdMeta.id },
    include: {
      appSettings: true,
      children: {
        include: {
          choreTemplates: {
            where: { active: true, archivedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              dayStatuses: {
                where: {
                  weekStart,
                },
                orderBy: { dayIndex: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      redemptions: {
        where: { archivedAt: null },
        include: {
          child: true,
          rewardItem: true,
        },
        orderBy: { createdAt: "desc" },
      },
      rewardItems: {
        where: { active: true, archivedAt: null },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!household) {
    throw new DomainError("Household not found", "NOT_FOUND", 404);
  }

  return household;
}

function dayStatusesToArray(statuses: { dayIndex: number; status: StarStatus }[], currentDay: number): StarCellState[] {
  const result: StarCellState[] = Array.from({ length: DAYS.length }).map((_, index) =>
    index < currentDay ? "empty" : "future",
  );
  statuses.forEach((entry) => {
    if (entry.dayIndex >= 0 && entry.dayIndex < result.length) {
      result[entry.dayIndex] = toAppStarStatus(entry.status);
    }
  });

  result.forEach((status, index) => {
    if (index >= currentDay && status === "empty") {
      result[index] = "future";
    }
  });

  return result;
}

function buildCanonicalOrderMap(household: Awaited<ReturnType<typeof getHouseholdGraph>>) {
  const map = new Map<string, number>();
  const referenceChild = household.children[0];
  if (!referenceChild) return map;
  referenceChild.choreTemplates
    .filter((template) => !template.isBonus)
    .forEach((template, index) => {
      map.set(template.slug, index);
    });
  return map;
}

function toLiveBoardPayload(household: Awaited<ReturnType<typeof getHouseholdGraph>>): LiveBoardPayload {
  const canonicalOrder = buildCanonicalOrderMap(household);

  const children: Child[] = household.children.map((child) => {
    const bonusTemplate = child.choreTemplates.find((template) => template.isBonus);
    const choreTemplates = child.choreTemplates
      .filter((template) => !template.isBonus)
      .sort((left, right) => {
        const leftCanonical = canonicalOrder.get(left.slug);
        const rightCanonical = canonicalOrder.get(right.slug);
        const leftScore = (leftCanonical ?? left.sortOrder + 0.5) * 100;
        const rightScore = (rightCanonical ?? right.sortOrder + 0.5) * 100;
        if (leftScore !== rightScore) return leftScore - rightScore;
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        return left.label.localeCompare(right.label);
      });

    const chores = choreTemplates.map((template) => ({
      id: template.slug,
      icon: template.icon,
      label: template.label,
      cells: dayStatusesToArray(template.dayStatuses, household.currentDay),
    }));

    const bonus = bonusTemplate
      ? dayStatusesToArray(bonusTemplate.dayStatuses, household.currentDay)
      : Array.from({ length: 7 }).map((_, index) => (index < household.currentDay ? "empty" : "future") as StarCellState);

    return {
      id: child.slug,
      name: child.name,
      age: child.age,
      avatar: child.avatar,
      accent: child.accent,
      coins: child.coins,
      chores,
      bonus,
    };
  });

  const redemptions = household.redemptions.map((entry) => {
    const status: "pending" | "fulfilled" = entry.status === RedemptionStatus.PENDING ? "pending" : "fulfilled";

    return {
      id: entry.id,
      childId: entry.child.slug,
      rewardId: entry.rewardItem?.slug ?? entry.rewardSlugAtRequest,
      createdAt: entry.createdAt.getTime(),
      status,
      fulfilledAt: entry.fulfilledAt?.getTime(),
    };
  });

  const paydaySummary: AppState["paydaySummary"] = {};

  children.forEach((child) => {
    const claimed = countClaimed(child);
    const carried = child.coins;
    const interest = Math.round((carried * household.interestRate) / 100);
    paydaySummary[child.id] = {
      carried,
      stars: claimed,
      interest,
      newBalance: carried + claimed + interest,
    };
  });

  return {
    householdId: household.slug,
    currentDay: household.currentDay,
    currentWeekStart: household.currentWeekStart.getTime(),
    paydayDay: household.paydayDay,
    interestRate: household.interestRate,
    kidsScreen: toAppKidsScreen(household.kidsScreen),
    settings: {
      sounds: household.appSettings?.soundsEnabled ?? true,
      animations: household.appSettings?.animationsEnabled ?? true,
    },
    children,
    redemptions,
    paydaySummary,
  };
}

async function findChoreStatusRow(tx: Prisma.TransactionClient, householdSlug: string, childId: ChildId, rowId: string, day: number, isBonus: boolean) {
  const household = await tx.household.findUnique({ where: { slug: householdSlug }, select: { id: true, currentWeekStart: true, currentDay: true, interestRate: true } });
  if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);
  if (day > household.currentDay) throw new DomainError("Cannot modify future day", "FUTURE_DAY", 400);

  const child = await tx.child.findUnique({
    where: {
      householdId_slug: {
        householdId: household.id,
        slug: childId,
      },
    },
    select: { id: true },
  });
  if (!child) throw new DomainError("Child not found", "NOT_FOUND", 404);

  const template = await tx.choreTemplate.findFirst({
    where: {
      householdId: household.id,
      childId: child.id,
      slug: isBonus ? "bonus" : rowId,
      isBonus,
      active: true,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!template) throw new DomainError("Chore row not found", "NOT_FOUND", 404);

  const status = await tx.choreDayStatus.findUnique({
    where: {
      childId_choreTemplateId_weekStart_dayIndex: {
        childId: child.id,
        choreTemplateId: template.id,
        weekStart: toWeekKey(household.currentWeekStart),
        dayIndex: day,
      },
    },
    select: { id: true, status: true, householdId: true },
  });

  if (!status) throw new DomainError("Day status row not found", "NOT_FOUND", 404);

  return { status, householdId: household.id };
}

export async function getBoardState(householdSlug: string): Promise<LiveBoardPayload> {
  await maybeAdvanceCurrentDay(householdSlug);
  const household = await getHouseholdGraph(householdSlug);
  return toLiveBoardPayload(household);
}

export async function getRewards(householdSlug: string) {
  const household = await prisma.household.findUnique({
    where: { slug: householdSlug },
    select: {
      id: true,
      rewardItems: {
        where: { active: true, archivedAt: null },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

  return household.rewardItems.map((entry) => ({
    id: entry.slug,
    name: entry.name,
    icon: entry.icon,
    cost: entry.cost,
    desc: entry.description,
  }));
}

export async function awardStar({
  householdSlug,
  childId,
  rowId,
  day,
  isBonus,
  actorUserId,
}: {
  householdSlug: string;
  childId: ChildId;
  rowId: string;
  day: number;
  isBonus: boolean;
  actorUserId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const { status, householdId } = await findChoreStatusRow(tx, householdSlug, childId, rowId, day, isBonus);

    if (status.status === StarStatus.PENDING || status.status === StarStatus.CLAIMED) {
      return;
    }

    await tx.choreDayStatus.update({
      where: { id: status.id },
      data: {
        status: StarStatus.PENDING,
        awardedAt: new Date(),
        awardedByUserId: actorUserId,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorType: "PARENT",
        actorId: actorUserId,
        eventType: "AWARD_STAR",
        payload: { childId, rowId: isBonus ? "bonus" : rowId, day, isBonus },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function claimStar({
  householdSlug,
  childId,
  rowId,
  day,
  isBonus,
  actorChildId,
}: {
  householdSlug: string;
  childId: ChildId;
  rowId: string;
  day: number;
  isBonus: boolean;
  actorChildId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const { status, householdId } = await findChoreStatusRow(tx, householdSlug, childId, rowId, day, isBonus);

    if (status.status !== StarStatus.PENDING) {
      throw new DomainError("Only pending stars can be claimed", "INVALID_STATE", 400);
    }

    await tx.choreDayStatus.update({
      where: { id: status.id },
      data: {
        status: StarStatus.CLAIMED,
        claimedAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorType: "KID",
        actorId: actorChildId,
        eventType: "CLAIM_STAR",
        payload: { childId, rowId: isBonus ? "bonus" : rowId, day, isBonus },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function requestRedemption({
  householdSlug,
  childId,
  rewardId,
}: {
  householdSlug: string;
  childId: ChildId;
  rewardId: RewardId;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({ where: { slug: householdSlug }, select: { id: true } });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    const child = await tx.child.findUnique({
      where: {
        householdId_slug: {
          householdId: household.id,
          slug: childId,
        },
      },
      select: { id: true, coins: true },
    });

    const reward = await tx.rewardItem.findUnique({
      where: {
        householdId_slug: {
          householdId: household.id,
          slug: rewardId,
        },
      },
      select: { id: true, slug: true, name: true, icon: true, cost: true, active: true, archivedAt: true },
    });

    if (!child || !reward) throw new DomainError("Invalid reward request", "NOT_FOUND", 404);
    if (!reward.active || reward.archivedAt) throw new DomainError("Reward is unavailable", "INVALID_STATE", 400);
    if (child.coins < reward.cost) throw new DomainError("Not enough coins", "INSUFFICIENT_COINS", 400);

    const nextBalance = child.coins - reward.cost;

    await tx.child.update({
      where: { id: child.id },
      data: { coins: nextBalance },
    });

    const redemption = await tx.redemption.create({
      data: {
        householdId: household.id,
        childId: child.id,
        rewardItemId: reward.id,
        rewardSlugAtRequest: reward.slug,
        rewardNameAtRequest: reward.name,
        rewardIconAtRequest: reward.icon,
        costAtRequest: reward.cost,
        status: RedemptionStatus.PENDING,
      },
    });

    await logCoinMovement(tx, {
      householdId: household.id,
      childId: child.id,
      movementType: CoinLedgerType.REWARD_SPEND,
      delta: -reward.cost,
      balanceBefore: child.coins,
      balanceAfter: nextBalance,
      sourceId: redemption.id,
      metadata: {
        rewardId: reward.slug,
        rewardName: reward.name,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "KID",
        actorId: child.id,
        eventType: "REQUEST_REDEMPTION",
        payload: { childId, rewardId },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function fulfillRedemption({
  householdSlug,
  redemptionId,
  actorUserId,
}: {
  householdSlug: string;
  redemptionId: string;
  actorUserId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({ where: { slug: householdSlug }, select: { id: true } });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    const redemption = await tx.redemption.findFirst({
      where: {
        id: redemptionId,
        householdId: household.id,
        archivedAt: null,
      },
      select: { id: true, status: true },
    });

    if (!redemption) throw new DomainError("Redemption not found", "NOT_FOUND", 404);
    if (redemption.status !== RedemptionStatus.PENDING) return;

    await tx.redemption.update({
      where: { id: redemption.id },
      data: {
        status: RedemptionStatus.FULFILLED,
        fulfilledAt: new Date(),
        fulfilledByUserId: actorUserId,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        actorId: actorUserId,
        eventType: "FULFILL_REDEMPTION",
        payload: { redemptionId },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function archiveRedemption({
  householdSlug,
  redemptionId,
  actorUserId,
}: {
  householdSlug: string;
  redemptionId: string;
  actorUserId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({ where: { slug: householdSlug }, select: { id: true } });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    const redemption = await tx.redemption.findFirst({
      where: {
        id: redemptionId,
        householdId: household.id,
      },
      select: { id: true },
    });

    if (!redemption) throw new DomainError("Redemption not found", "NOT_FOUND", 404);

    await tx.redemption.delete({
      where: { id: redemption.id },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        actorId: actorUserId,
        eventType: "ARCHIVE_REDEMPTION",
        payload: { redemptionId },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function runPayday({
  householdSlug,
  actorUserId,
}: {
  householdSlug: string;
  actorUserId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const householdMeta = await tx.household.findUnique({
      where: { slug: householdSlug },
      select: { id: true, currentWeekStart: true },
    });

    if (!householdMeta) throw new DomainError("Household not found", "NOT_FOUND", 404);
    const weekStart = toWeekKey(householdMeta.currentWeekStart);

    const household = await tx.household.findUnique({
      where: { id: householdMeta.id },
      include: {
        children: {
          include: {
            choreTemplates: {
              where: { active: true, archivedAt: null },
              include: {
                dayStatuses: {
                  where: {
                    weekStart,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    const existingRun = await tx.paydayRun.findUnique({
      where: {
        householdId_weekStart: {
          householdId: household.id,
          weekStart: toWeekKey(household.currentWeekStart),
        },
      },
      select: { id: true },
    });

    if (existingRun) {
      return;
    }

    const paydayRun = await tx.paydayRun.create({
      data: {
        householdId: household.id,
        weekStart: toWeekKey(household.currentWeekStart),
        interestRate: household.interestRate,
        executedByUserId: actorUserId,
      },
    });

    for (const child of household.children) {
      let stars = 0;
      child.choreTemplates.forEach((template) => {
        template.dayStatuses.forEach((status) => {
          if (status.status === StarStatus.CLAIMED) stars += 1;
        });
      });

      const carried = child.coins;
      const interest = Math.round((carried * household.interestRate) / 100);
      const newBalance = carried + stars + interest;

      let runningBalance = carried;

      if (stars > 0) {
        const afterStars = runningBalance + stars;
        await logCoinMovement(tx, {
          householdId: household.id,
          childId: child.id,
          movementType: CoinLedgerType.PAYDAY_STARS,
          delta: stars,
          balanceBefore: runningBalance,
          balanceAfter: afterStars,
          weekStart,
          sourceId: paydayRun.id,
          metadata: { kind: "payday" },
        });
        runningBalance = afterStars;
      }

      if (interest > 0) {
        const afterInterest = runningBalance + interest;
        await logCoinMovement(tx, {
          householdId: household.id,
          childId: child.id,
          movementType: CoinLedgerType.PAYDAY_INTEREST,
          delta: interest,
          balanceBefore: runningBalance,
          balanceAfter: afterInterest,
          weekStart,
          sourceId: paydayRun.id,
          metadata: { kind: "payday" },
        });
        runningBalance = afterInterest;
      }

      await tx.child.update({
        where: { id: child.id },
        data: { coins: newBalance },
      });

      await tx.paydayResult.create({
        data: {
          paydayRunId: paydayRun.id,
          childId: child.id,
          carried,
          stars,
          interest,
          newBalance,
        },
      });
    }

    await tx.choreDayStatus.updateMany({
      where: {
        householdId: household.id,
        weekStart: toWeekKey(household.currentWeekStart),
        status: { in: [StarStatus.FUTURE, StarStatus.PENDING] },
      },
      data: {
        status: StarStatus.EMPTY,
      },
    });

    await tx.household.update({
      where: { id: household.id },
      data: {
        currentDay: 6,
        kidsScreen: "PAYDAY_READY",
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        actorId: actorUserId,
        eventType: "RUN_PAYDAY",
        payload: { weekStart: household.currentWeekStart.toISOString() },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function setKidsScreenState({
  householdSlug,
  screen,
  actorType,
  actorId,
}: {
  householdSlug: string;
  screen: "celebration" | "closed";
  actorType: "PARENT" | "KID";
  actorId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({
      where: { slug: householdSlug },
      select: { id: true, kidsScreen: true },
    });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    const target = toPrismaKidsScreen(screen);
    const current = household.kidsScreen;
    const validTransition =
      (current === "PAYDAY_READY" && (target === "CELEBRATION" || target === "CLOSED")) ||
      (current === "CELEBRATION" && (target === "CELEBRATION" || target === "CLOSED")) ||
      (current === "CLOSED" && target === "CLOSED");

    if (!validTransition) {
      throw new DomainError("Invalid kids screen transition", "INVALID_STATE", 400);
    }

    await tx.household.update({
      where: { id: household.id },
      data: { kidsScreen: target },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType,
        actorId,
        eventType: "SET_KIDS_SCREEN",
        payload: { screen },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function startNewWeek({
  householdSlug,
  actorUserId,
}: {
  householdSlug: string;
  actorUserId?: string;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({
      where: { slug: householdSlug },
      select: {
        id: true,
        currentWeekStart: true,
        kidsScreen: true,
        timeZone: true,
      },
    });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);
    if (household.kidsScreen !== "CLOSED") {
      throw new DomainError("Week can only roll over after payday is closed.", "INVALID_STATE", 400);
    }

    const nextWeekStart = getNextWeekStart(household.currentWeekStart, household.timeZone);
    const templates = await tx.choreTemplate.findMany({
      where: { householdId: household.id, active: true, archivedAt: null },
      select: { id: true, childId: true },
    });

    if (templates.length > 0) {
      const nextCurrentDay = getCurrentDayIndex(new Date(), household.timeZone);
      const nextRows = templates.flatMap((template) =>
        Array.from({ length: 7 }).map((_, dayIndex) => ({
          householdId: household.id,
          childId: template.childId,
          choreTemplateId: template.id,
          weekStart: nextWeekStart,
          dayIndex,
          status: dayIndex <= nextCurrentDay ? StarStatus.EMPTY : StarStatus.FUTURE,
        })),
      );

      await tx.choreDayStatus.createMany({
        data: nextRows,
        skipDuplicates: true,
      });
    }

    await tx.household.update({
      where: { id: household.id },
      data: {
        currentWeekStart: nextWeekStart,
        currentDay: getCurrentDayIndex(new Date(), household.timeZone),
        kidsScreen: "ACTIVE",
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        actorId: actorUserId,
        eventType: "START_NEW_WEEK",
        payload: {
          previousWeekStart: household.currentWeekStart.toISOString(),
          nextWeekStart: nextWeekStart.toISOString(),
        },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function updateSettings({
  householdSlug,
  interestRate,
  paydayDay,
  sounds,
  animations,
}: {
  householdSlug: string;
  interestRate?: number;
  paydayDay?: number;
  sounds?: boolean;
  animations?: boolean;
}): Promise<LiveBoardPayload> {
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({ where: { slug: householdSlug }, select: { id: true } });
    if (!household) throw new DomainError("Household not found", "NOT_FOUND", 404);

    if (typeof interestRate === "number" || typeof paydayDay === "number") {
      await tx.household.update({
        where: { id: household.id },
        data: {
          ...(typeof interestRate === "number" ? { interestRate } : {}),
          ...(typeof paydayDay === "number" ? { paydayDay } : {}),
        },
      });
    }

    if (typeof sounds === "boolean" || typeof animations === "boolean") {
      await tx.appSettings.upsert({
        where: { householdId: household.id },
        create: {
          householdId: household.id,
          soundsEnabled: sounds ?? true,
          animationsEnabled: animations ?? true,
          demoModeEnabled: true,
        },
        update: {
          ...(typeof sounds === "boolean" ? { soundsEnabled: sounds } : {}),
          ...(typeof animations === "boolean" ? { animationsEnabled: animations } : {}),
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorType: "PARENT",
        eventType: "UPDATE_SETTINGS",
        payload: { interestRate, paydayDay, sounds, animations },
      },
    });
  });

  return getBoardState(householdSlug);
}

export async function verifyParentLogin({
  householdSlug,
  email,
  password,
}: {
  householdSlug: string;
  email: string;
  password: string;
}): Promise<{ userId: string; householdId: string }> {
  const user = await prisma.user.findFirst({
    where: {
      household: { slug: householdSlug },
      email,
    },
    select: { id: true, householdId: true, passwordHash: true },
  });

  if (!user) throw new DomainError("Invalid credentials", "AUTH_FAILED", 401);

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new DomainError("Invalid credentials", "AUTH_FAILED", 401);

  return { userId: user.id, householdId: householdSlug };
}

export async function verifyKidPin({
  householdSlug,
  childSlug,
  pin,
}: {
  householdSlug: string;
  childSlug?: string;
  pin: string;
}): Promise<{ childId?: string; householdId: string }> {
  if (!childSlug?.trim()) {
    const household = await prisma.household.findUnique({
      where: { slug: householdSlug },
      select: { id: true },
    });
    if (!household) throw new DomainError("Invalid child login", "AUTH_FAILED", 401);

    const children = await prisma.child.findMany({
      where: { householdId: household.id },
      select: {
        pinHash: true,
        pinFailCount: true,
        pinLockedUntil: true,
      },
      orderBy: { createdAt: "asc" },
      take: 1,
    });

    const canonical = children[0];
    if (!canonical) throw new DomainError("Invalid child login", "AUTH_FAILED", 401);

    if (canonical.pinLockedUntil && canonical.pinLockedUntil.getTime() > Date.now()) {
      throw new DomainError("PIN temporarily locked", "PIN_LOCKED", 429);
    }

    const isValid = await bcrypt.compare(pin, canonical.pinHash);

    if (!isValid) {
      const nextFails = canonical.pinFailCount + 1;
      const shouldLock = nextFails >= 5;
      await prisma.child.updateMany({
        where: { householdId: household.id },
        data: {
          pinFailCount: nextFails,
          lastPinAttemptAt: new Date(),
          pinLockedUntil: shouldLock ? new Date(Date.now() + 1000 * 60 * 15) : null,
        },
      });

      throw new DomainError("Invalid PIN", "AUTH_FAILED", 401);
    }

    await prisma.child.updateMany({
      where: { householdId: household.id },
      data: {
        pinFailCount: 0,
        pinLockedUntil: null,
        lastPinAttemptAt: new Date(),
      },
    });

    return {
      householdId: householdSlug,
    };
  }

  const child = await prisma.child.findFirst({
    where: {
      household: { slug: householdSlug },
      slug: childSlug,
    },
    select: {
      id: true,
      slug: true,
      pinHash: true,
      pinFailCount: true,
      pinLockedUntil: true,
      householdId: true,
    },
  });

  if (!child) throw new DomainError("Invalid child login", "AUTH_FAILED", 401);

  if (child.pinLockedUntil && child.pinLockedUntil.getTime() > Date.now()) {
    throw new DomainError("PIN temporarily locked", "PIN_LOCKED", 429);
  }

  const isValid = await bcrypt.compare(pin, child.pinHash);

  if (!isValid) {
    const nextFails = child.pinFailCount + 1;
    const shouldLock = nextFails >= 5;
    await prisma.child.update({
      where: { id: child.id },
      data: {
        pinFailCount: nextFails,
        lastPinAttemptAt: new Date(),
        pinLockedUntil: shouldLock ? new Date(Date.now() + 1000 * 60 * 15) : null,
      },
    });

    throw new DomainError("Invalid PIN", "AUTH_FAILED", 401);
  }

  await prisma.child.update({
    where: { id: child.id },
    data: {
      pinFailCount: 0,
      pinLockedUntil: null,
      lastPinAttemptAt: new Date(),
    },
  });

  return {
    childId: child.slug,
    householdId: householdSlug,
  };
}

export async function listKidLoginOptions(householdSlug: string): Promise<Array<{ id: string; name: string }>> {
  const household = await prisma.household.findUnique({
    where: { slug: householdSlug },
    select: { id: true },
  });
  if (!household) return [];

  const children = await prisma.child.findMany({
    where: { householdId: household.id },
    select: { slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return children.map((child) => ({ id: child.slug, name: child.name }));
}
