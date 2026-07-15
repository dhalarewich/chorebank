-- CreateEnum
CREATE TYPE "CoinLedgerType" AS ENUM ('REWARD_SPEND', 'PAYDAY_STARS', 'PAYDAY_INTEREST', 'ADMIN_RESET');

-- AlterTable
ALTER TABLE "ChoreTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RewardItem" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Redemption"
  ADD COLUMN "rewardSlugAtRequest" TEXT,
  ADD COLUMN "rewardNameAtRequest" TEXT,
  ADD COLUMN "rewardIconAtRequest" TEXT,
  ADD COLUMN "costAtRequest" INTEGER,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ALTER COLUMN "rewardItemId" DROP NOT NULL;

-- Backfill immutable redemption snapshot fields from current reward rows.
UPDATE "Redemption" r
SET
  "rewardSlugAtRequest" = COALESCE(rw."slug", 'unknown-reward'),
  "rewardNameAtRequest" = COALESCE(rw."name", 'Unknown Reward'),
  "rewardIconAtRequest" = COALESCE(rw."icon", 'Gift'),
  "costAtRequest" = COALESCE(rw."cost", 0)
FROM "RewardItem" rw
WHERE r."rewardItemId" = rw."id";

UPDATE "Redemption"
SET
  "rewardSlugAtRequest" = COALESCE("rewardSlugAtRequest", 'unknown-reward'),
  "rewardNameAtRequest" = COALESCE("rewardNameAtRequest", 'Unknown Reward'),
  "rewardIconAtRequest" = COALESCE("rewardIconAtRequest", 'Gift'),
  "costAtRequest" = COALESCE("costAtRequest", 0)
WHERE
  "rewardSlugAtRequest" IS NULL
  OR "rewardNameAtRequest" IS NULL
  OR "rewardIconAtRequest" IS NULL
  OR "costAtRequest" IS NULL;

ALTER TABLE "Redemption"
  ALTER COLUMN "rewardSlugAtRequest" SET NOT NULL,
  ALTER COLUMN "rewardNameAtRequest" SET NOT NULL,
  ALTER COLUMN "rewardIconAtRequest" SET NOT NULL,
  ALTER COLUMN "costAtRequest" SET NOT NULL;

-- CreateTable
CREATE TABLE "CoinLedgerEntry" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "movementType" "CoinLedgerType" NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "weekStart" TIMESTAMP(3),
  "sourceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoinLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoinLedgerEntry_householdId_childId_createdAt_idx" ON "CoinLedgerEntry"("householdId", "childId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinLedgerEntry_householdId_movementType_createdAt_idx" ON "CoinLedgerEntry"("householdId", "movementType", "createdAt");

-- Fix FK for nullable reward reference while preserving history snapshots
ALTER TABLE "Redemption" DROP CONSTRAINT "Redemption_rewardItemId_fkey";
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "RewardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedgerEntry" ADD CONSTRAINT "CoinLedgerEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedgerEntry" ADD CONSTRAINT "CoinLedgerEntry_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
