ALTER TABLE "business_os"."User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "business_os"."LoginRateLimit" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoginRateLimit_email_ip_key" ON "business_os"."LoginRateLimit"("email", "ip");
CREATE INDEX "LoginRateLimit_updatedAt_idx" ON "business_os"."LoginRateLimit"("updatedAt");
