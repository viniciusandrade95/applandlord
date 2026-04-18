-- Sprint 3: robust SaaS data model

-- 1) Rename invoices physical table to rent_charges while keeping Prisma model Invoice.
ALTER TABLE "Invoice" RENAME TO "rent_charges";
ALTER INDEX "Invoice_pkey" RENAME TO "rent_charges_pkey";
ALTER INDEX "Invoice_leaseId_period_key" RENAME TO "rent_charges_leaseId_period_key";
ALTER INDEX "Invoice_ownerId_idx" RENAME TO "rent_charges_ownerId_idx";
ALTER INDEX "Invoice_dueDate_idx" RENAME TO "rent_charges_dueDate_idx";
ALTER INDEX "Invoice_status_idx" RENAME TO "rent_charges_status_idx";

-- 2) New core tables for finance, notifications and auditability.
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "propertyId" TEXT,
  "unitId" TEXT,
  "leaseId" TEXT,
  "invoiceId" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "leaseId" TEXT,
  "invoiceId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "externalRef" TEXT,
  "failureReason" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "renterId" TEXT,
  "invoiceId" TEXT,
  "reminderId" TEXT,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "templateName" TEXT,
  "providerMsgId" TEXT,
  "toPhone" TEXT,
  "fromPhone" TEXT,
  "body" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Queued',
  "failureReason" TEXT,
  "providerPayload" JSONB,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "actorId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- 3) Constraint: one active lease per unit/owner.
CREATE UNIQUE INDEX "Lease_one_active_per_unit_owner_key"
  ON "Lease" ("ownerId", "unitId")
  WHERE "status" = 'Active';

-- 4) Essential indexes.
CREATE INDEX "Lease_ownerId_status_startDate_idx" ON "Lease"("ownerId", "status", "startDate");
CREATE INDEX "Lease_ownerId_unitId_status_idx" ON "Lease"("ownerId", "unitId", "status");
CREATE INDEX "rent_charges_ownerId_status_dueDate_idx" ON "rent_charges"("ownerId", "status", "dueDate");
CREATE INDEX "Payment_ownerId_paidAt_idx" ON "Payment"("ownerId", "paidAt");

CREATE INDEX "Expense_ownerId_idx" ON "Expense"("ownerId");
CREATE INDEX "Expense_propertyId_idx" ON "Expense"("propertyId");
CREATE INDEX "Expense_unitId_idx" ON "Expense"("unitId");
CREATE INDEX "Expense_leaseId_idx" ON "Expense"("leaseId");
CREATE INDEX "Expense_invoiceId_idx" ON "Expense"("invoiceId");
CREATE INDEX "Expense_ownerId_incurredAt_idx" ON "Expense"("ownerId", "incurredAt");

CREATE INDEX "Reminder_ownerId_idx" ON "Reminder"("ownerId");
CREATE INDEX "Reminder_leaseId_idx" ON "Reminder"("leaseId");
CREATE INDEX "Reminder_invoiceId_idx" ON "Reminder"("invoiceId");
CREATE INDEX "Reminder_ownerId_status_scheduledFor_idx" ON "Reminder"("ownerId", "status", "scheduledFor");

CREATE INDEX "WhatsAppMessage_ownerId_idx" ON "WhatsAppMessage"("ownerId");
CREATE INDEX "WhatsAppMessage_renterId_idx" ON "WhatsAppMessage"("renterId");
CREATE INDEX "WhatsAppMessage_invoiceId_idx" ON "WhatsAppMessage"("invoiceId");
CREATE INDEX "WhatsAppMessage_reminderId_idx" ON "WhatsAppMessage"("reminderId");
CREATE INDEX "WhatsAppMessage_ownerId_status_createdAt_idx" ON "WhatsAppMessage"("ownerId", "status", "createdAt");
CREATE INDEX "WhatsAppMessage_providerMsgId_idx" ON "WhatsAppMessage"("providerMsgId");

CREATE INDEX "AuditLog_ownerId_idx" ON "AuditLog"("ownerId");
CREATE INDEX "AuditLog_ownerId_createdAt_idx" ON "AuditLog"("ownerId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- 5) Foreign keys.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "rent_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "rent_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "Renter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "rent_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
