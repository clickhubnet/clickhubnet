ALTER TABLE "Appointment" ADD COLUMN "stageId" UUID;
ALTER TABLE "Appointment" ADD COLUMN "assignedToAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "createdById" UUID;
ALTER TABLE "Appointment" ADD COLUMN "ownerAdminId" UUID;

CREATE TABLE "AppointmentStage" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'A Fazer',
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "AppointmentStage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppointmentStage_active_order_idx" ON "AppointmentStage"("active", "order");
CREATE INDEX "AppointmentStage_deletedAt_idx" ON "AppointmentStage"("deletedAt");
CREATE INDEX "Appointment_stageId_idx" ON "Appointment"("stageId");
CREATE INDEX "Appointment_createdById_idx" ON "Appointment"("createdById");
CREATE INDEX "Appointment_ownerAdminId_idx" ON "Appointment"("ownerAdminId");
CREATE INDEX "Appointment_assignedToAll_idx" ON "Appointment"("assignedToAll");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "AppointmentStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_ownerAdminId_fkey" FOREIGN KEY ("ownerAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AppointmentStage" ("id", "name", "status", "order", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'A Fazer', 'A Fazer', 10, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Em Andamento', 'Em Andamento', 20, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Concluido', 'Concluido', 30, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cancelado', 'Cancelado', 40, true, CURRENT_TIMESTAMP);

UPDATE "Appointment" a
SET "stageId" = s."id"
FROM "AppointmentStage" s
WHERE s."status" = a."status";
