CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');
ALTER TABLE "Expense" ADD COLUMN "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Expense" ADD COLUMN "paymentMethod" TEXT;
UPDATE "Expense" SET "status" = CASE
  WHEN "paidAt" IS NOT NULL THEN 'PAID'::"ExpenseStatus"
  WHEN "dueAt" IS NOT NULL AND "dueAt" < NOW() THEN 'OVERDUE'::"ExpenseStatus"
  ELSE 'PENDING'::"ExpenseStatus"
END;
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
