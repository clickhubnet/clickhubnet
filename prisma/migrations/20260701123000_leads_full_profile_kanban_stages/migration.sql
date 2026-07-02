ALTER TABLE "Lead" ADD COLUMN "customerCode" TEXT;
ALTER TABLE "Lead" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "streetNumber" TEXT;
ALTER TABLE "Lead" ADD COLUMN "complement" TEXT;
ALTER TABLE "Lead" ADD COLUMN "kanbanStageId" UUID;
ALTER TABLE "Lead" ADD COLUMN "planName" TEXT;
ALTER TABLE "Lead" ADD COLUMN "planValue" DECIMAL(12,2);
ALTER TABLE "Lead" ADD COLUMN "billingDueDay" INTEGER;

WITH numbered_leads AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS row_number
  FROM "Lead"
  WHERE "customerCode" IS NULL
)
UPDATE "Lead" l
SET "customerCode" = 'CDP-' || LPAD(numbered_leads.row_number::TEXT, 6, '0')
FROM numbered_leads
WHERE l."id" = numbered_leads."id";

ALTER TABLE "Lead" ALTER COLUMN "customerCode" SET NOT NULL;

CREATE UNIQUE INDEX "Lead_customerCode_key" ON "Lead"("customerCode");

CREATE TABLE "LeadKanbanStage" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'CONTACTED',
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "LeadKanbanStage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadKanbanStage_active_order_idx" ON "LeadKanbanStage"("active", "order");
CREATE INDEX "LeadKanbanStage_deletedAt_idx" ON "LeadKanbanStage"("deletedAt");
CREATE INDEX "Lead_kanbanStageId_idx" ON "Lead"("kanbanStageId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_kanbanStageId_fkey" FOREIGN KEY ("kanbanStageId") REFERENCES "LeadKanbanStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "LeadKanbanStage" ("id", "name", "status", "order", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'Novo', 'NEW', 10, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Contato', 'CONTACTED', 20, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Qualificado', 'QUALIFIED', 30, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Proposta', 'PROPOSAL', 40, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Fechado', 'WON', 50, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Perdido', 'LOST', 60, true, CURRENT_TIMESTAMP);

UPDATE "Lead" l
SET "kanbanStageId" = s."id"
FROM "LeadKanbanStage" s
WHERE s."status" = l."status";
