DROP INDEX IF EXISTS "Payment_ownerId_confirmationStatus_idx";

ALTER TABLE "Payment"
  DROP COLUMN IF EXISTS "receiptUrl",
  DROP COLUMN IF EXISTS "confirmationStatus",
  DROP COLUMN IF EXISTS "confirmedAt",
  DROP COLUMN IF EXISTS "confirmedByUserId";
