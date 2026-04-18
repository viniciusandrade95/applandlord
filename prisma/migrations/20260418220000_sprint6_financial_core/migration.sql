-- Sprint 6: núcleo financeiro (pagamento com confirmação manual)
ALTER TABLE "Payment"
  ADD COLUMN "receiptUrl" TEXT,
  ADD COLUMN "confirmationStatus" TEXT NOT NULL DEFAULT 'AwaitingConfirmation',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByUserId" TEXT;

CREATE INDEX "Payment_ownerId_confirmationStatus_idx" ON "Payment"("ownerId", "confirmationStatus");

-- Normalização defensiva de dados legados: tudo pré-existente já confirmado.
UPDATE "Payment"
SET "confirmationStatus" = 'Confirmed',
    "confirmedAt" = COALESCE("confirmedAt", "paidAt")
WHERE "confirmationStatus" = 'AwaitingConfirmation';
