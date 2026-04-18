-- Sprint 9: ticket workflow with formal states and timeline

ALTER TABLE "MaintenanceTicket"
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "renterId" TEXT,
  ADD COLUMN "triagedAt" TIMESTAMP(3),
  ADD COLUMN "waitingAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "currentEventAt" TIMESTAMP(3);

UPDATE "MaintenanceTicket"
SET "status" = CASE
  WHEN LOWER("status") = 'open' THEN 'New'
  WHEN LOWER("status") = 'in progress' THEN 'Triaged'
  WHEN LOWER("status") = 'resolved' THEN 'Resolved'
  ELSE 'New'
END;

ALTER TABLE "MaintenanceTicket"
  ALTER COLUMN "status" SET DEFAULT 'New';

CREATE TABLE "TicketEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "note" TEXT,
  "payload" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceTicket_leaseId_idx" ON "MaintenanceTicket"("leaseId");
CREATE INDEX "MaintenanceTicket_renterId_idx" ON "MaintenanceTicket"("renterId");
CREATE INDEX "MaintenanceTicket_ownerId_status_priority_updatedAt_idx" ON "MaintenanceTicket"("ownerId", "status", "priority", "updatedAt");
CREATE INDEX "TicketEvent_ownerId_idx" ON "TicketEvent"("ownerId");
CREATE INDEX "TicketEvent_ticketId_idx" ON "TicketEvent"("ticketId");
CREATE INDEX "TicketEvent_ownerId_ticketId_createdAt_idx" ON "TicketEvent"("ownerId", "ticketId", "createdAt");

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "Renter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
