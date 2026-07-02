import { prisma } from "@/lib/prisma";
import type { CreatePlanInput, UpdatePlanInput } from "@/modules/n8n/types/plan";

export class PlanRepository {
  async findMany() {
    return prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });
  }

  async findActive() {
    return prisma.plan.findMany({
      where: { deletedAt: null, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });
  }

  async create(data: CreatePlanInput) {
    return prisma.plan.create({ data: { ...data, speed: data.speed ?? "" } });
  }

  async update(id: string, data: UpdatePlanInput) {
    return prisma.plan.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }
}
