-- Sprint 5: state machine transition logs for rent charges
CREATE TABLE "RentChargeTransitionLog" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "previousStatus" TEXT NOT NULL,
  "newStatus" TEXT NOT NULL,
  "note" TEXT,
  "triggeredByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentChargeTransitionLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RentChargeTransitionLog"
  ADD CONSTRAINT "RentChargeTransitionLog_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RentChargeTransitionLog"
  ADD CONSTRAINT "RentChargeTransitionLog_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "rent_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "RentChargeTransitionLog_ownerId_idx" ON "RentChargeTransitionLog"("ownerId");
CREATE INDEX "RentChargeTransitionLog_invoiceId_idx" ON "RentChargeTransitionLog"("invoiceId");
CREATE INDEX "RentChargeTransitionLog_ownerId_invoiceId_createdAt_idx" ON "RentChargeTransitionLog"("ownerId", "invoiceId", "createdAt");
