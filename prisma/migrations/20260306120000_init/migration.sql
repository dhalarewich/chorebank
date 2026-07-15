-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('PARENT', 'KID', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StarStatus" AS ENUM ('EMPTY', 'FUTURE', 'PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'FULFILLED');

-- CreateEnum
CREATE TYPE "KidsScreen" AS ENUM ('ACTIVE', 'PAYDAY_READY', 'CELEBRATION', 'CLOSED');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interestRate" INTEGER NOT NULL DEFAULT 5,
    "currentDay" INTEGER NOT NULL DEFAULT 4,
    "kidsScreen" "KidsScreen" NOT NULL DEFAULT 'ACTIVE',
    "currentWeekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "soundsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "animationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "demoModeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PARENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "avatar" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "pinHash" TEXT NOT NULL,
    "pinFailCount" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "lastPinAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreTemplate" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isBonus" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreDayStatus" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "choreTemplateId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "status" "StarStatus" NOT NULL,
    "awardedByUserId" TEXT,
    "awardedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreDayStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "rewardItemId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledByUserId" TEXT,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaydayRun" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "interestRate" INTEGER NOT NULL,
    "executedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaydayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaydayResult" (
    "id" TEXT NOT NULL,
    "paydayRunId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "carried" INTEGER NOT NULL,
    "stars" INTEGER NOT NULL,
    "interest" INTEGER NOT NULL,
    "newBalance" INTEGER NOT NULL,

    CONSTRAINT "PaydayResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Household_slug_key" ON "Household"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_householdId_key" ON "AppSettings"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "User_householdId_email_key" ON "User"("householdId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Child_householdId_slug_key" ON "Child"("householdId", "slug");

-- CreateIndex
CREATE INDEX "ChoreTemplate_householdId_childId_idx" ON "ChoreTemplate"("householdId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreTemplate_childId_slug_key" ON "ChoreTemplate"("childId", "slug");

-- CreateIndex
CREATE INDEX "ChoreDayStatus_householdId_weekStart_dayIndex_idx" ON "ChoreDayStatus"("householdId", "weekStart", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreDayStatus_childId_choreTemplateId_weekStart_dayIndex_key" ON "ChoreDayStatus"("childId", "choreTemplateId", "weekStart", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RewardItem_householdId_slug_key" ON "RewardItem"("householdId", "slug");

-- CreateIndex
CREATE INDEX "Redemption_householdId_status_createdAt_idx" ON "Redemption"("householdId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaydayRun_householdId_weekStart_key" ON "PaydayRun"("householdId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "PaydayResult_paydayRunId_childId_key" ON "PaydayResult"("paydayRunId", "childId");

-- CreateIndex
CREATE INDEX "AuditEvent_householdId_createdAt_idx" ON "AuditEvent"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreTemplate" ADD CONSTRAINT "ChoreTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreTemplate" ADD CONSTRAINT "ChoreTemplate_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreDayStatus" ADD CONSTRAINT "ChoreDayStatus_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreDayStatus" ADD CONSTRAINT "ChoreDayStatus_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreDayStatus" ADD CONSTRAINT "ChoreDayStatus_choreTemplateId_fkey" FOREIGN KEY ("choreTemplateId") REFERENCES "ChoreTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardItem" ADD CONSTRAINT "RewardItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "RewardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaydayRun" ADD CONSTRAINT "PaydayRun_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaydayResult" ADD CONSTRAINT "PaydayResult_paydayRunId_fkey" FOREIGN KEY ("paydayRunId") REFERENCES "PaydayRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaydayResult" ADD CONSTRAINT "PaydayResult_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

