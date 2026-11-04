-- Roles, content workflow, retention and payment-plan additions.
CREATE TYPE "business_os"."UserRole" AS ENUM ('ADMIN', 'EMPLOYEE');
ALTER TABLE "business_os"."User" ADD COLUMN "role" "business_os"."UserRole" NOT NULL DEFAULT 'EMPLOYEE';
-- The pre-role dashboard had one global-admin user model. Preserve that access
-- for every account that existed before this migration; newly created logins
-- explicitly receive their intended ADMIN or EMPLOYEE role in application code.
UPDATE "business_os"."User" SET "role" = 'ADMIN';
ALTER TABLE "business_os"."User" ADD COLUMN "teamMemberId" TEXT;
ALTER TABLE "business_os"."User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "business_os"."User" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_teamMemberId_key" ON "business_os"."User"("teamMemberId");
ALTER TABLE "business_os"."User" ADD CONSTRAINT "User_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "business_os"."TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_os"."Client" ADD COLUMN "rebookIntervalDays" INTEGER NOT NULL DEFAULT 30;

CREATE TYPE "business_os"."PaymentPlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');
CREATE TABLE "business_os"."PaymentPlan" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "name" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'monthly', "startDate" TIMESTAMP(3) NOT NULL, "installments" INTEGER,
  "nextDueDate" TIMESTAMP(3) NOT NULL, "status" "business_os"."PaymentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT NOT NULL DEFAULT '', "isSample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentPlan_status_nextDueDate_idx" ON "business_os"."PaymentPlan"("status", "nextDueDate");
ALTER TABLE "business_os"."PaymentPlan" ADD CONSTRAINT "PaymentPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "business_os"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_os"."Payment" ADD COLUMN "paymentPlanId" TEXT;
ALTER TABLE "business_os"."Payment" ADD CONSTRAINT "Payment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "business_os"."PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "business_os"."ContentStatus" AS ENUM ('IDEA','SCRIPTED','READY_TO_FILM','FILMED','EDITED','SCHEDULED','POSTED','ARCHIVED');
CREATE TYPE "business_os"."ContentPostStatus" AS ENUM ('SCHEDULED','POSTED','MISSED');
CREATE TABLE "business_os"."ContentPiece" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "hook" TEXT NOT NULL DEFAULT '', "format" TEXT NOT NULL DEFAULT 'Short-form',
  "script" TEXT NOT NULL DEFAULT '', "researchNotes" TEXT NOT NULL DEFAULT '', "referenceLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "shotList" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "cta" TEXT NOT NULL DEFAULT '', "caption" TEXT NOT NULL DEFAULT '',
  "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "priority" INTEGER NOT NULL DEFAULT 2, "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "assignedToId" TEXT, "dueAt" TIMESTAMP(3), "jobId" TEXT, "mediaLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "business_os"."ContentStatus" NOT NULL DEFAULT 'IDEA', "isSample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContentPiece_status_dueAt_idx" ON "business_os"."ContentPiece"("status", "dueAt");
CREATE INDEX "ContentPiece_assignedToId_dueAt_idx" ON "business_os"."ContentPiece"("assignedToId", "dueAt");
ALTER TABLE "business_os"."ContentPiece" ADD CONSTRAINT "ContentPiece_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "business_os"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_os"."ContentPiece" ADD CONSTRAINT "ContentPiece_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "business_os"."Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "business_os"."ContentStageEvent" ("id" TEXT NOT NULL,"pieceId" TEXT NOT NULL,"from" "business_os"."ContentStatus","to" "business_os"."ContentStatus" NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ContentStageEvent_pkey" PRIMARY KEY ("id"));
ALTER TABLE "business_os"."ContentStageEvent" ADD CONSTRAINT "ContentStageEvent_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "business_os"."ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "business_os"."ContentAccount" ("id" TEXT NOT NULL,"platform" TEXT NOT NULL,"handle" TEXT NOT NULL DEFAULT '',"profileUrl" TEXT NOT NULL DEFAULT '',"active" BOOLEAN NOT NULL DEFAULT true,"isSample" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ContentAccount_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ContentAccount_platform_handle_key" ON "business_os"."ContentAccount"("platform", "handle");
CREATE TABLE "business_os"."ContentPost" ("id" TEXT NOT NULL,"pieceId" TEXT NOT NULL,"accountId" TEXT NOT NULL,"scheduledAt" TIMESTAMP(3) NOT NULL,"caption" TEXT NOT NULL DEFAULT '',"status" "business_os"."ContentPostStatus" NOT NULL DEFAULT 'SCHEDULED',"postedAt" TIMESTAMP(3),"postedUrl" TEXT NOT NULL DEFAULT '',"isSample" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ContentPost_status_scheduledAt_idx" ON "business_os"."ContentPost"("status", "scheduledAt");
CREATE INDEX "ContentPost_accountId_scheduledAt_idx" ON "business_os"."ContentPost"("accountId", "scheduledAt");
ALTER TABLE "business_os"."ContentPost" ADD CONSTRAINT "ContentPost_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "business_os"."ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_os"."ContentPost" ADD CONSTRAINT "ContentPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "business_os"."ContentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "business_os"."CrmSavedView" ("id" TEXT NOT NULL,"userId" TEXT,"name" TEXT NOT NULL,"filters" JSONB NOT NULL DEFAULT '{}',"isSample" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "CrmSavedView_pkey" PRIMARY KEY ("id"));
ALTER TABLE "business_os"."CrmSavedView" ADD CONSTRAINT "CrmSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "business_os"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
