-- Sprint 2: auth + owner isolation base
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Property" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Unit" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Renter" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Lease" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "MaintenanceTicket" ADD COLUMN "ownerId" TEXT;

DO $$
DECLARE
  default_owner_id TEXT;
BEGIN
  INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt")
  VALUES (
    'bootstrap_owner',
    'owner@applandlord.local',
    'CHANGE_ME_ON_FIRST_LOGIN',
    'Bootstrap Owner',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("email") DO NOTHING;

  SELECT "id" INTO default_owner_id FROM "User" WHERE "email" = 'owner@applandlord.local' LIMIT 1;

  UPDATE "Property" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "Unit" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "Renter" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "Lease" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "Invoice" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "Payment" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
  UPDATE "MaintenanceTicket" SET "ownerId" = default_owner_id WHERE "ownerId" IS NULL;
END $$;

ALTER TABLE "Property" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Unit" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Renter" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Lease" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "MaintenanceTicket" ALTER COLUMN "ownerId" SET NOT NULL;

CREATE INDEX "Property_ownerId_idx" ON "Property"("ownerId");
CREATE INDEX "Unit_ownerId_idx" ON "Unit"("ownerId");
CREATE INDEX "Renter_ownerId_idx" ON "Renter"("ownerId");
CREATE INDEX "Lease_ownerId_idx" ON "Lease"("ownerId");
CREATE INDEX "Invoice_ownerId_idx" ON "Invoice"("ownerId");
CREATE INDEX "Payment_ownerId_idx" ON "Payment"("ownerId");
CREATE INDEX "MaintenanceTicket_ownerId_idx" ON "MaintenanceTicket"("ownerId");

ALTER TABLE "Property" ADD CONSTRAINT "Property_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Renter" ADD CONSTRAINT "Renter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
