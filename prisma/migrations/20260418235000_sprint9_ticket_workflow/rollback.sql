-- Rollback Sprint 9: ticket workflow

ALTER TABLE "TicketEvent" DROP CONSTRAINT IF EXISTS "TicketEvent_ticketId_fkey";
ALTER TABLE "TicketEvent" DROP CONSTRAINT IF EXISTS "TicketEvent_ownerId_fkey";

DROP INDEX IF EXISTS "TicketEvent_ownerId_ticketId_createdAt_idx";
DROP INDEX IF EXISTS "TicketEvent_ticketId_idx";
DROP INDEX IF EXISTS "TicketEvent_ownerId_idx";
DROP TABLE IF EXISTS "TicketEvent";

ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT IF EXISTS "MaintenanceTicket_leaseId_fkey";
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT IF EXISTS "MaintenanceTicket_renterId_fkey";

DROP INDEX IF EXISTS "MaintenanceTicket_ownerId_status_priority_updatedAt_idx";
DROP INDEX IF EXISTS "MaintenanceTicket_leaseId_idx";
DROP INDEX IF EXISTS "MaintenanceTicket_renterId_idx";

ALTER TABLE "MaintenanceTicket"
  DROP COLUMN IF EXISTS "leaseId",
  DROP COLUMN IF EXISTS "renterId",
  DROP COLUMN IF EXISTS "triagedAt",
  DROP COLUMN IF EXISTS "waitingAt",
  DROP COLUMN IF EXISTS "closedAt",
  DROP COLUMN IF EXISTS "currentEventAt";

ALTER TABLE "MaintenanceTicket"
  ALTER COLUMN "status" SET DEFAULT 'Open';

UPDATE "MaintenanceTicket"
SET "status" = CASE
  WHEN "status" = 'New' THEN 'Open'
  WHEN "status" = 'Triaged' THEN 'In progress'
  WHEN "status" = 'Waiting' THEN 'In progress'
  WHEN "status" = 'Resolved' THEN 'Resolved'
  WHEN "status" = 'Closed' THEN 'Resolved'
  ELSE "status"
END;
