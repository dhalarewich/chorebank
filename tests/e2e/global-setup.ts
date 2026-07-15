import { createHouseholdSetup } from "../../src/lib/server/setup";
import { prisma } from "../../src/lib/server/prisma";

export default async function globalSetup() {
  await prisma.rateLimitBucket.deleteMany();
  await prisma.household.deleteMany();

  await createHouseholdSetup(
    {
      householdName: "Playwright Household",
      householdSlug: "chorebank-household",
      timeZone: "America/Vancouver",
      parentEmail: "parent@example.test",
      parentPassword: "test-password-123",
      kidPin: "1234",
      childName: "Alex",
      addStarterData: true,
    },
    "chorebank-household",
  );

  await prisma.child.updateMany({ data: { coins: 25 } });
  await prisma.$disconnect();
}
