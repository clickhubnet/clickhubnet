ALTER TABLE "Lead" ADD COLUMN "wonAt" TIMESTAMP(3);

UPDATE "Lead"
SET "wonAt" = "updatedAt"
WHERE "status" = 'WON' AND "wonAt" IS NULL;

CREATE INDEX "Lead_wonAt_idx" ON "Lead"("wonAt");

CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_paidAt_idx" ON "Expense"("paidAt");
CREATE INDEX "Expense_dueAt_idx" ON "Expense"("dueAt");
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");
