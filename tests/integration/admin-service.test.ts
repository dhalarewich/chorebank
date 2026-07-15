import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, getBoardStateMock, getCurrentDayIndexMock, getWeekStartMock } = vi.hoisted(() => ({
  prismaMock: {
    household: { findUnique: vi.fn() },
    choreTemplate: { findMany: vi.fn() },
    rewardItem: { findMany: vi.fn() },
    auditEvent: { findMany: vi.fn() },
    child: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  bcryptMock: {
    hash: vi.fn(),
  },
  getBoardStateMock: vi.fn(),
  getCurrentDayIndexMock: vi.fn(),
  getWeekStartMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMock,
  ...bcryptMock,
}));

vi.mock("@/lib/server/domain/week", () => ({
  getCurrentDayIndex: getCurrentDayIndexMock,
  getWeekStart: getWeekStartMock,
}));

vi.mock("@/lib/server/domain/board-service", () => {
  class DomainError extends Error {
    code: string;
    status: number;

    constructor(message: string, code = "DOMAIN_ERROR", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    DomainError,
    getBoardState: getBoardStateMock,
  };
});

import {
  createAdminReward,
  deleteAdminChild,
  getAdminAuditEvents,
  getAdminChores,
  resetAdminHouseholdState,
  reorderAdminRewards,
  updateSharedAdminChore,
  updateAdminHouseholdSettings,
} from "@/lib/server/domain/admin-service";

function expectDomainError(error: unknown, code: string) {
  expect(error).toMatchObject({ code });
}

describe("admin-service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps active chores into the admin list shape", async () => {
    prismaMock.household.findUnique.mockResolvedValue({
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    });
    prismaMock.choreTemplate.findMany.mockResolvedValue([
      {
        id: "ct_1",
        slug: "make-bed",
        label: "Make Bed",
        icon: "🛏️",
        sortOrder: 0,
        active: true,
        child: { slug: "soren" },
      },
    ]);

    const chores = await getAdminChores("local-household");

    expect(chores).toEqual([
      {
        id: "ct_1",
        childId: "soren",
        slug: "make-bed",
        label: "Make Bed",
        icon: "🛏️",
        sortOrder: 0,
        active: true,
      },
    ]);
  });

  it("creates rewards with normalized text and a unique slug", async () => {
    const household = {
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    };
    prismaMock.household.findUnique.mockResolvedValue(household);

    const tx = {
      rewardItem: {
        findMany: vi.fn().mockResolvedValue([
          { slug: "movie-night", sortOrder: 0, active: true, archivedAt: null },
        ]),
        create: vi.fn().mockResolvedValue({ id: "reward_2" }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));
    prismaMock.rewardItem.findMany.mockResolvedValue([
      {
        id: "reward_2",
        slug: "movie-night-2",
        name: "Movie Night",
        icon: "🎬",
        description: "Family movie night",
        cost: 25,
        sortOrder: 1,
        active: true,
      },
    ]);

    const rewards = await createAdminReward({
      householdSlug: "local-household",
      name: "  Movie   Night  ",
      icon: " 🎬 ",
      description: " Family   movie night ",
      cost: 25,
    });

    expect(tx.rewardItem.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh_1",
        slug: "movie-night-2",
        name: "Movie Night",
        icon: "🎬",
        description: "Family movie night",
        cost: 25,
        active: true,
        sortOrder: 1,
      },
    });
    expect(rewards[0]?.slug).toBe("movie-night-2");
  });

  it("rejects reward reordering when no ids are provided", async () => {
    await expect(
      reorderAdminRewards({
        householdSlug: "local-household",
        orderedRewardIds: [],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "INVALID_INPUT");
      return true;
    });
  });

  it("updates every matching shared chore in one transaction operation", async () => {
    prismaMock.household.findUnique.mockResolvedValue({ id: "hh_1", slug: "local-household" });
    prismaMock.choreTemplate.findMany.mockResolvedValue([]);
    const tx = {
      choreTemplate: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));

    await updateSharedAdminChore({ householdSlug: "local-household", slug: "make-bed", label: "Make your bed" });

    expect(tx.choreTemplate.updateMany).toHaveBeenCalledWith({
      where: { householdId: "hh_1", slug: "make-bed", isBonus: false, archivedAt: null },
      data: { label: "Make your bed" },
    });
  });

  it("updates household settings and rotates the shared kid pin", async () => {
    const household = {
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    };
    prismaMock.household.findUnique.mockResolvedValue(household);
    bcryptMock.hash.mockResolvedValue("hashed-pin");
    getBoardStateMock.mockResolvedValue({ householdId: "local-household", ok: true });

    const tx = {
      household: {
        update: vi.fn().mockResolvedValue({}),
      },
      child: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));

    await updateAdminHouseholdSettings({
      householdSlug: "local-household",
      interestRate: 8,
      paydayDay: 6,
      kidPin: "2468",
    });

    expect(bcryptMock.hash).toHaveBeenCalledWith("2468", 10);
    expect(tx.household.update).toHaveBeenCalledWith({
      where: { id: "hh_1" },
      data: { interestRate: 8, paydayDay: 6 },
    });
    expect(tx.child.updateMany).toHaveBeenCalledWith({
      where: { householdId: "hh_1" },
      data: {
        pinHash: "hashed-pin",
        pinFailCount: 0,
        pinLockedUntil: null,
        lastPinAttemptAt: null,
      },
    });
  });

  it("blocks deleting the last remaining child", async () => {
    const household = {
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    };
    prismaMock.household.findUnique.mockResolvedValue(household);

    const tx = {
      child: {
        findMany: vi.fn().mockResolvedValue([{ id: "child_1", slug: "soren", name: "Soren" }]),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(
      deleteAdminChild({
        householdSlug: "local-household",
        childSlug: "soren",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "VALIDATION_ERROR");
      return true;
    });
  });

  it("maps audit events to transport-safe timestamps", async () => {
    const createdAt = new Date("2026-03-12T20:15:00.000Z");
    prismaMock.household.findUnique.mockResolvedValue({
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    });
    prismaMock.auditEvent.findMany.mockResolvedValue([
      {
        id: "evt_1",
        actorType: "PARENT",
        actorId: "user_1",
        eventType: "ADMIN_CREATE_REWARD",
        payload: { slug: "movie-night" },
        createdAt,
      },
    ]);

    const events = await getAdminAuditEvents("local-household");

    expect(events).toEqual([
      {
        id: "evt_1",
        actorType: "PARENT",
        actorId: "user_1",
        eventType: "ADMIN_CREATE_REWARD",
        payload: { slug: "movie-night" },
        createdAt: createdAt.getTime(),
      },
    ]);
  });

  it("resets household balances, redemptions, and week rows without deleting templates", async () => {
    const nextWeekStart = new Date("2026-03-14T08:00:00.000Z");
    getWeekStartMock.mockReturnValue(nextWeekStart);
    getCurrentDayIndexMock.mockReturnValue(2);
    getBoardStateMock.mockResolvedValue({ householdId: "local-household", ok: true });

    prismaMock.household.findUnique.mockResolvedValue({
      id: "hh_1",
      slug: "local-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    });

    const tx = {
      child: {
        findMany: vi.fn().mockResolvedValue([
          { id: "child_1", slug: "soren", coins: 12 },
          { id: "child_2", slug: "stella", coins: 0 },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      choreTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { id: "tpl_1", childId: "child_1" },
          { id: "tpl_2", childId: "child_2" },
        ]),
      },
      redemption: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      coinLedgerEntry: {
        create: vi.fn().mockResolvedValue({}),
      },
      household: {
        update: vi.fn().mockResolvedValue({}),
      },
      choreDayStatus: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 14 }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx));

    await resetAdminHouseholdState("local-household");

    expect(tx.redemption.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh_1" },
    });
    expect(tx.coinLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.coinLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "hh_1",
        childId: "child_1",
        delta: -12,
        balanceBefore: 12,
        balanceAfter: 0,
      }),
    });
    expect(tx.choreDayStatus.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          householdId: "hh_1",
          childId: "child_1",
          choreTemplateId: "tpl_1",
          weekStart: nextWeekStart,
          dayIndex: 0,
        }),
        expect.objectContaining({
          householdId: "hh_1",
          childId: "child_2",
          choreTemplateId: "tpl_2",
          weekStart: nextWeekStart,
          dayIndex: 6,
        }),
      ]),
      skipDuplicates: true,
    });
  });
});
