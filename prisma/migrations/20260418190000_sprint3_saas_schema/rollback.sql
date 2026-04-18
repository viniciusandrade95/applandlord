-- Sprint 3 rollback: revert robust SaaS data model

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_ownerId_fkey";
ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_reminderId_fkey";
ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_invoiceId_fkey";
ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_renterId_fkey";
ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_ownerId_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_invoiceId_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_leaseId_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_ownerId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_invoiceId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_leaseId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_unitId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_propertyId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_ownerId_fkey";

DROP INDEX IF EXISTS "AuditLog_action_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_entityType_entityId_idx";
DROP INDEX IF EXISTS "AuditLog_ownerId_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_ownerId_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_providerMsgId_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_ownerId_status_createdAt_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_reminderId_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_invoiceId_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_renterId_idx";
DROP INDEX IF EXISTS "WhatsAppMessage_ownerId_idx";
DROP INDEX IF EXISTS "Reminder_ownerId_status_scheduledFor_idx";
DROP INDEX IF EXISTS "Reminder_invoiceId_idx";
DROP INDEX IF EXISTS "Reminder_leaseId_idx";
DROP INDEX IF EXISTS "Reminder_ownerId_idx";
DROP INDEX IF EXISTS "Expense_ownerId_incurredAt_idx";
DROP INDEX IF EXISTS "Expense_invoiceId_idx";
DROP INDEX IF EXISTS "Expense_leaseId_idx";
DROP INDEX IF EXISTS "Expense_unitId_idx";
DROP INDEX IF EXISTS "Expense_propertyId_idx";
DROP INDEX IF EXISTS "Expense_ownerId_idx";
DROP INDEX IF EXISTS "Payment_ownerId_paidAt_idx";
DROP INDEX IF EXISTS "rent_charges_ownerId_status_dueDate_idx";
DROP INDEX IF EXISTS "Lease_ownerId_unitId_status_idx";
DROP INDEX IF EXISTS "Lease_ownerId_status_startDate_idx";
DROP INDEX IF EXISTS "Lease_one_active_per_unit_owner_key";

DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "WhatsAppMessage";
DROP TABLE IF EXISTS "Reminder";
DROP TABLE IF EXISTS "Expense";

ALTER INDEX IF EXISTS "rent_charges_status_idx" RENAME TO "Invoice_status_idx";
ALTER INDEX IF EXISTS "rent_charges_dueDate_idx" RENAME TO "Invoice_dueDate_idx";
ALTER INDEX IF EXISTS "rent_charges_ownerId_idx" RENAME TO "Invoice_ownerId_idx";
ALTER INDEX IF EXISTS "rent_charges_leaseId_period_key" RENAME TO "Invoice_leaseId_period_key";
ALTER INDEX IF EXISTS "rent_charges_pkey" RENAME TO "Invoice_pkey";
ALTER TABLE "rent_charges" RENAME TO "Invoice";
