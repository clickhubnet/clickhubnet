import { prisma } from "@/lib/prisma";

async function main() {
  const [users, leadStages, appointmentStages, plans, ceps, agents] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.leadKanbanStage.count({ where: { deletedAt: null, active: true } }),
    prisma.appointmentStage.count({ where: { deletedAt: null, active: true } }),
    prisma.plan.count({ where: { deletedAt: null } }),
    prisma.coverageCep.count({ where: { deletedAt: null } }),
    prisma.agent.count(),
  ]);

  console.log(JSON.stringify({ users, leadStages, appointmentStages, plans, ceps, agents }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
