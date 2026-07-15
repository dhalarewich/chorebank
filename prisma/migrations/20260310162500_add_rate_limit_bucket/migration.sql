-- CreateTable
CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_scope_key_windowStart_key" ON "RateLimitBucket"("scope", "key", "windowStart");

-- CreateIndex
CREATE INDEX "RateLimitBucket_scope_key_expiresAt_idx" ON "RateLimitBucket"("scope", "key", "expiresAt");
