import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock } = vi.hoisted(() => ({
  prismaMock: {
    household: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    child: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    rewardItem: {
      findUnique: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    appSettings: {
      upsert: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  bcryptMock: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMock,
  ...bcryptMock,
}));

import {
  DomainError,
  getRewards,
  listKidLoginOptions,
  requestRedemption,
  runPayday,
  setKidsScreenState,
  startNewWeek,
  updateSettings,
  verifyKidPin,
  verifyParentLogin,
} from "@/lib/server/domain/board-service";

function expectDomainError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("board-service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns active rewards mapped to live payload shape", async () => {
    prismaMock.household.findUnique.mockResolvedValue({
      id: "h_1",
      rewardItems: [
        { slug: "screen-time", name: "Screen Time", icon: "📺", cost: 10, description: "30 mins" },
        { slug: "movie-night", name: "Movie Night", icon: "🎬", cost: 20, description: "Family movie" },
      ],
    });

    const rewards = await getRewards("local-household");

    expect(rewards).toEqual([
      { id: "screen-time", name: "Screen Time", icon: "📺", cost: 10, desc: "30 mins" },
      { id: "movie-night", name: "Movie Night", icon: "🎬", cost: 20, desc: "Family movie" },
    ]);
  });

  it("throws when rewards are requested for an unknown household", async () => {
    prismaMock.household.findUnique.mockResolvedValue(null);

    await expect(getRewards("missing-house")).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "NOT_FOUND");
      return true;
    });
  });

  it("verifies parent credentials with bcrypt", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u_parent",
      householdId: "h_1",
      passwordHash: "hash",
    });
    bcryptMock.compare.mockResolvedValue(true);

    const result = await verifyParentLogin({
      householdSlug: "local-household",
      email: "parent@example.com",
      password: "demo-parent",
    });

    expect(result).toEqual({ userId: "u_parent", householdId: "local-household" });
    expect(bcryptMock.compare).toHaveBeenCalledWith("demo-parent", "hash");
  });

  it("rejects parent login when password does not match", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u_parent",
      householdId: "h_1",
      passwordHash: "hash",
    });
    bcryptMock.compare.mockResolvedValue(false);

    await expect(
      verifyParentLogin({
        householdSlug: "local-household",
        email: "parent@example.com",
        password: "wrong-password",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "AUTH_FAILED");
      return true;
    });
  });

  it("locks canonical child PIN after fifth failed attempt", async () => {
    prismaMock.household.findUnique.mockResolvedValue({ id: "h_1" });
    prismaMock.child.findMany.mockResolvedValue([
      {
        pinHash: "hash",
        pinFailCount: 4,
        pinLockedUntil: null,
      },
    ]);
    bcryptMock.compare.mockResolvedValue(false);

    await expect(
      verifyKidPin({
        householdSlug: "local-household",
        pin: "9999",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "AUTH_FAILED");
      return true;
    });

    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId: "h_1" },
        data: expect.objectContaining({
          pinFailCount: 5,
          pinLockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it("resets child PIN fail counters after successful child-specific login", async () => {
    prismaMock.child.findFirst.mockResolvedValue({
      id: "c_1",
      slug: "soren",
      pinHash: "hash",
      pinFailCount: 2,
      pinLockedUntil: null,
      householdId: "h_1",
    });
    bcryptMock.compare.mockResolvedValue(true);

    const result = await verifyKidPin({
      householdSlug: "local-household",
      childSlug: "soren",
      pin: "1234",
    });

    expect(result).toEqual({ childId: "soren", householdId: "local-household" });
    expect(prismaMock.child.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c_1" },
        data: expect.objectContaining({
          pinFailCount: 0,
          pinLockedUntil: null,
        }),
      }),
    );
  });

  it("returns kid login options ordered by createdAt", async () => {
    prismaMock.household.findUnique.mockResolvedValue({ id: "h_1" });
    prismaMock.child.findMany.mockResolvedValue([
      { slug: "soren", name: "Soren" },
      { slug: "stella", name: "Stella" },
    ]);

    const options = await listKidLoginOptions("local-household");

    expect(options).toEqual([
      { id: "soren", name: "Soren" },
      { id: "stella", name: "Stella" },
    ]);
  });

  it("rejects redemption request when child lacks coins", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        household: {
          findUnique: vi.fn().mockResolvedValue({ id: "h_1" }),
        },
        child: {
          findUnique: vi.fn().mockResolvedValue({ id: "c_1", coins: 2 }),
        },
        rewardItem: {
          findUnique: vi.fn().mockResolvedValue({
            id: "r_1",
            slug: "movie-night",
            name: "Movie Night",
            icon: "🎬",
            cost: 10,
            active: true,
            archivedAt: null,
          }),
        },
      }),
    );

    await expect(
      requestRedemption({
        householdSlug: "local-household",
        childId: "soren",
        rewardId: "movie-night",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "INSUFFICIENT_COINS");
      return true;
    });
  });

  it("rejects invalid kids screen transition from ACTIVE to celebration", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        household: {
          findUnique: vi.fn().mockResolvedValue({ id: "h_1", kidsScreen: "ACTIVE" }),
        },
      }),
    );

    await expect(
      setKidsScreenState({
        householdSlug: "local-household",
        screen: "celebration",
        actorType: "PARENT",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "INVALID_STATE");
      return true;
    });
  });

  it("rejects startNewWeek unless kids screen is CLOSED", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        household: {
          findUnique: vi.fn().mockResolvedValue({
            id: "h_1",
            currentWeekStart: new Date("2026-03-07T08:00:00.000Z"),
            kidsScreen: "PAYDAY_READY",
          }),
        },
      }),
    );

    await expect(
      startNewWeek({
        householdSlug: "local-household",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "INVALID_STATE");
      return true;
    });
  });

  it("rejects settings update when household does not exist", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        household: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      updateSettings({
        householdSlug: "missing-house",
        interestRate: 7,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "NOT_FOUND");
      return true;
    });
  });

  it("rejects payday run when household does not exist", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        household: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      runPayday({
        householdSlug: "missing-house",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectDomainError(error, "NOT_FOUND");
      return true;
    });
  });
});
