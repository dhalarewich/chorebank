import { prisma } from "../src/lib/server/prisma";

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const part = args[index];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = value;
    index += 1;
  }

  return {
    source: result.source ?? "unknown",
  };
}

async function main() {
  const { source } = parseArgs();

  const [paydayRun, redemption, coinLedgerEntry] = await Promise.all([
    prisma.paydayRun.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        household: { select: { slug: true } },
        results: { select: { childId: true, stars: true, interest: true, newBalance: true } },
      },
    }),
    prisma.redemption.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        householdId: true,
        childId: true,
        rewardNameAtRequest: true,
        status: true,
        createdAt: true,
        fulfilledAt: true,
      },
    }),
    prisma.coinLedgerEntry.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        householdId: true,
        childId: true,
        movementType: true,
        delta: true,
        balanceAfter: true,
        createdAt: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source,
        latestPaydayRun: paydayRun
          ? {
              id: paydayRun.id,
              householdSlug: paydayRun.household.slug,
              weekStart: paydayRun.weekStart.toISOString(),
              createdAt: paydayRun.createdAt.toISOString(),
              resultsCount: paydayRun.results.length,
              results: paydayRun.results,
            }
          : null,
        latestRedemption: redemption
          ? {
              ...redemption,
              createdAt: redemption.createdAt.toISOString(),
              fulfilledAt: redemption.fulfilledAt ? redemption.fulfilledAt.toISOString() : null,
            }
          : null,
        latestCoinLedgerEntry: coinLedgerEntry
          ? {
              ...coinLedgerEntry,
              createdAt: coinLedgerEntry.createdAt.toISOString(),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
