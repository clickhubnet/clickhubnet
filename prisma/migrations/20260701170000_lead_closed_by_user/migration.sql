ALTER TABLE "Lead" ADD COLUMN "closedByUserId" UUID;

CREATE INDEX "Lead_closedByUserId_idx" ON "Lead"("closedByUserId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
