-- Messaging: lead reply and missed-call text-back. Additive only: one enum value, new nullable/defaulted Client columns, three new tables.
-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'MISSED_CALL';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "smsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsConsentAt" TIMESTAMP(3),
ADD COLUMN     "smsConsentSource" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smsConsentText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smsOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "direction" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL DEFAULT 'console',
    "providerId" TEXT,
    "error" TEXT NOT NULL DEFAULT '',
    "sendAfter" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "clientId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "hangupCause" TEXT NOT NULL DEFAULT '',
    "missed" BOOLEAN NOT NULL DEFAULT false,
    "handledAt" TIMESTAMP(3),
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "leadReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "missedCallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leadReplyTemplate" TEXT NOT NULL DEFAULT '',
    "missedCallTemplate" TEXT NOT NULL DEFAULT '',
    "businessName" TEXT NOT NULL DEFAULT '',
    "bookingUrl" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',
    "quietStartHour" INTEGER NOT NULL DEFAULT 8,
    "quietEndHour" INTEGER NOT NULL DEFAULT 20,
    "dedupeHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerId_key" ON "Message"("providerId");

-- CreateIndex
CREATE INDEX "Message_toNumber_template_createdAt_idx" ON "Message"("toNumber", "template", "createdAt");

-- CreateIndex
CREATE INDEX "Message_status_sendAfter_idx" ON "Message"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "Message_clientId_createdAt_idx" ON "Message"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCall_callSessionId_key" ON "PhoneCall"("callSessionId");

-- CreateIndex
CREATE INDEX "PhoneCall_createdAt_idx" ON "PhoneCall"("createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

