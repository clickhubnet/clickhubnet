ALTER TABLE "Agent"
ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'MALE',
ADD COLUMN "zapiBaseUrl" TEXT,
ADD COLUMN "zapiInstanceId" TEXT,
ADD COLUMN "zapiToken" TEXT,
ADD COLUMN "zapiClientToken" TEXT,
ADD COLUMN "zapiWhatsappNumber" TEXT;

CREATE TABLE "_AgentToPlan" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

CREATE UNIQUE INDEX "_AgentToPlan_AB_unique" ON "_AgentToPlan"("A", "B");
CREATE INDEX "_AgentToPlan_B_index" ON "_AgentToPlan"("B");
ALTER TABLE "_AgentToPlan" ADD CONSTRAINT "_AgentToPlan_A_fkey" FOREIGN KEY ("A") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_AgentToPlan" ADD CONSTRAINT "_AgentToPlan_B_fkey" FOREIGN KEY ("B") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
