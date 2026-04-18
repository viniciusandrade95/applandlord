-- Sprint 11: inbound whatsapp tracking + idempotency
CREATE TABLE "WhatsAppInboundEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "renterId" TEXT,
  "leaseId" TEXT,
  "invoiceId" TEXT,
  "senderPhone" TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppInboundEvent_ownerId_dedupeKey_key"
  ON "WhatsAppInboundEvent"("ownerId", "dedupeKey");

CREATE INDEX "WhatsAppInboundEvent_ownerId_senderPhone_createdAt_idx"
  ON "WhatsAppInboundEvent"("ownerId", "senderPhone", "createdAt");

CREATE INDEX "WhatsAppInboundEvent_ownerId_intent_createdAt_idx"
  ON "WhatsAppInboundEvent"("ownerId", "intent", "createdAt");

CREATE INDEX "WhatsAppInboundEvent_providerMessageId_idx"
  ON "WhatsAppInboundEvent"("providerMessageId");

ALTER TABLE "WhatsAppInboundEvent"
  ADD CONSTRAINT "WhatsAppInboundEvent_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppInboundEvent"
  ADD CONSTRAINT "WhatsAppInboundEvent_renterId_fkey"
  FOREIGN KEY ("renterId") REFERENCES "Renter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppInboundEvent"
  ADD CONSTRAINT "WhatsAppInboundEvent_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppInboundEvent"
  ADD CONSTRAINT "WhatsAppInboundEvent_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "rent_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
