import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { CepImportService } from "@/modules/ceps/services/cep-import.service";
import { ensureInitialUsers } from "./initial-users";

const leadStages = [
  { name: "Novos", status: "NEW", order: 10 },
  { name: "Em contato", status: "CONTACTED", order: 20 },
  { name: "Qualificados", status: "QUALIFIED", order: 30 },
  { name: "Proposta", status: "PROPOSAL", order: 40 },
  { name: "Ganhos", status: "WON", order: 50 },
  { name: "Perdidos", status: "LOST", order: 60 },
] as const;

const appointmentStages = [
  { name: "A Fazer", status: "A Fazer", order: 10 },
  { name: "Em andamento", status: "Em andamento", order: 20 },
  { name: "Concluido", status: "Concluido", order: 30 },
] as const;

async function ensureLeadStages() {
  for (const stage of leadStages) {
    const existing = await prisma.leadKanbanStage.findFirst({
      where: { name: stage.name, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.leadKanbanStage.update({
        where: { id: existing.id },
        data: { status: stage.status, order: stage.order, active: true, deletedAt: null },
      });
      continue;
    }

    await prisma.leadKanbanStage.create({ data: stage });
  }

  return prisma.leadKanbanStage.count({ where: { deletedAt: null, active: true } });
}

async function ensureAppointmentStages() {
  for (const stage of appointmentStages) {
    const existing = await prisma.appointmentStage.findFirst({
      where: { name: stage.name, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.appointmentStage.update({
        where: { id: existing.id },
        data: { status: stage.status, order: stage.order, active: true, deletedAt: null },
      });
      continue;
    }

    await prisma.appointmentStage.create({ data: stage });
  }

  return prisma.appointmentStage.count({ where: { deletedAt: null, active: true } });
}

async function importCeps() {
  const fileName = "CEPS_CRIS_ABR_26.xlsx";
  const filePath = resolve(process.cwd(), "data", fileName);
  const buffer = await readFile(filePath);
  const service = new CepImportService();
  return service.importFromBuffer(buffer, fileName);
}

async function main() {
  const users = await ensureInitialUsers();
  const activeLeadStages = await ensureLeadStages();
  const activeAppointmentStages = await ensureAppointmentStages();
  const cepImport = await importCeps();
  const [plans, agents, ceps] = await Promise.all([
    prisma.plan.count({ where: { deletedAt: null } }),
    prisma.agent.count(),
    prisma.coverageCep.count({ where: { deletedAt: null } }),
  ]);

  console.log(
    JSON.stringify(
      {
        users,
        activeLeadStages,
        activeAppointmentStages,
        plans,
        agents,
        ceps,
        cepImport,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
