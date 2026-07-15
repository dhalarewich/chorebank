import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoinLedgerType, RedemptionStatus, StarStatus } from "@prisma/client";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    household: { findUnique: vi.fn() },
    child: { findMany: vi.fn() },
    choreDayStatus: { groupBy: vi.fn() },
    redemption: { groupBy: vi.fn() },
    coinLedgerEntry: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/server/prisma";
import { getAdminReportingSummary } from "@/lib/server/domain/admin-service";

type HouseholdFindUniqueResult = Awaited<ReturnType<typeof prisma.household.findUnique>>;
type ChildFindManyResult = Awaited<ReturnType<typeof prisma.child.findMany>>;
type ChoreGroupByResult = Awaited<ReturnType<typeof prisma.choreDayStatus.groupBy>>;
type RedemptionGroupByResult = Awaited<ReturnType<typeof prisma.redemption.groupBy>>;
type LedgerGroupByResult = Awaited<ReturnType<typeof prisma.coinLedgerEntry.groupBy>>;

describe("getAdminReportingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses immutable redemption snapshot costs and ledger totals", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh_1",
      slug: "chorebank-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-01T00:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    } as unknown as HouseholdFindUniqueResult);

    vi.mocked(prisma.child.findMany).mockResolvedValue([
      { id: "child_db_1", slug: "primary", name: "Casey", coins: 43 },
      { id: "child_db_2", slug: "secondary", name: "Riley", coins: 36 },
    ] as unknown as ChildFindManyResult);

    vi.mocked(prisma.choreDayStatus.groupBy).mockResolvedValue([
      { childId: "child_db_1", _count: { _all: 30 } },
      { childId: "child_db_2", _count: { _all: 27 } },
    ] as unknown as ChoreGroupByResult);

    vi.mocked(prisma.redemption.groupBy).mockResolvedValue([
      {
        childId: "child_db_1",
        status: RedemptionStatus.FULFILLED,
        _count: { _all: 2 },
        _sum: { costAtRequest: 45 },
      },
      {
        childId: "child_db_1",
        status: RedemptionStatus.PENDING,
        _count: { _all: 1 },
        _sum: { costAtRequest: 75 },
      },
      {
        childId: "child_db_2",
        status: RedemptionStatus.FULFILLED,
        _count: { _all: 1 },
        _sum: { costAtRequest: 30 },
      },
    ] as unknown as RedemptionGroupByResult);

    vi.mocked(prisma.coinLedgerEntry.groupBy).mockResolvedValue([
      { childId: "child_db_1", movementType: CoinLedgerType.PAYDAY_STARS, _sum: { delta: 30 } },
      { childId: "child_db_1", movementType: CoinLedgerType.PAYDAY_INTEREST, _sum: { delta: 2 } },
      { childId: "child_db_1", movementType: CoinLedgerType.REWARD_SPEND, _sum: { delta: -120 } },
      { childId: "child_db_2", movementType: CoinLedgerType.PAYDAY_STARS, _sum: { delta: 27 } },
      { childId: "child_db_2", movementType: CoinLedgerType.PAYDAY_INTEREST, _sum: { delta: 1 } },
      { childId: "child_db_2", movementType: CoinLedgerType.REWARD_SPEND, _sum: { delta: -30 } },
    ] as unknown as LedgerGroupByResult);

    const summary = await getAdminReportingSummary("chorebank-household");

    expect(summary.children).toHaveLength(2);
    expect(summary.children[0]).toMatchObject({
      childId: "primary",
      claimedStars: 30,
      redemptionsRequested: 3,
      redemptionsFulfilled: 2,
      coinsSpent: 120,
      coinsEarnedFromStars: 30,
      coinsEarnedFromInterest: 2,
    });
    expect(summary.children[1]).toMatchObject({
      childId: "secondary",
      claimedStars: 27,
      redemptionsRequested: 1,
      redemptionsFulfilled: 1,
      coinsSpent: 30,
      coinsEarnedFromStars: 27,
      coinsEarnedFromInterest: 1,
    });

    expect(summary.totals).toMatchObject({
      claimedStars: 57,
      redemptionsRequested: 4,
      redemptionsFulfilled: 3,
      pendingRedemptions: 1,
      coinsSpent: 150,
      coinsEarnedFromStars: 57,
      coinsEarnedFromInterest: 3,
      netCoinDelta: -90,
    });

    expect(prisma.redemption.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["childId", "status"],
        _sum: { costAtRequest: true },
      }),
    );
  });

  it("filters claimed stars from claimed status only", async () => {
    vi.mocked(prisma.household.findUnique).mockResolvedValue({
      id: "hh_1",
      slug: "chorebank-household",
      currentDay: 4,
      currentWeekStart: new Date("2026-03-01T00:00:00.000Z"),
      interestRate: 5,
      paydayDay: 5,
    } as unknown as HouseholdFindUniqueResult);
    vi.mocked(prisma.child.findMany).mockResolvedValue(
      [{ id: "child_db_1", slug: "primary", name: "Casey", coins: 10 }] as unknown as ChildFindManyResult,
    );
    vi.mocked(prisma.choreDayStatus.groupBy).mockResolvedValue(
      [{ childId: "child_db_1", _count: { _all: 2 } }] as unknown as ChoreGroupByResult,
    );
    vi.mocked(prisma.redemption.groupBy).mockResolvedValue([] as unknown as RedemptionGroupByResult);
    vi.mocked(prisma.coinLedgerEntry.groupBy).mockResolvedValue([] as unknown as LedgerGroupByResult);

    const summary = await getAdminReportingSummary("chorebank-household");
    expect(summary.children[0]?.claimedStars).toBe(2);

    expect(prisma.choreDayStatus.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: StarStatus.CLAIMED,
        }),
      }),
    );
  });
});
