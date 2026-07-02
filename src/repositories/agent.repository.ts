import { prisma } from "@/lib/prisma";
import type { CreateAgentInput, UpdateAgentInput } from "@/modules/n8n/types/agent";

export class AgentRepository {
  async findMany() {
    return prisma.agent.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { plans: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
    });
  }

  async create(data: CreateAgentInput) {
    const { planIds, ...agent } = data;
    return prisma.agent.create({
      data: {
        ...agent,
        rules: data.rules ?? {},
        flow: data.flow ?? {},
        plans: planIds?.length ? { connect: planIds.map((id) => ({ id })) } : undefined,
      },
      include: { plans: true },
    });
  }

  async update(id: string, data: UpdateAgentInput) {
    const { planIds, ...agent } = data;
    return prisma.agent.update({
      where: { id },
      data: {
        ...agent,
        plans: planIds ? { set: planIds.map((planId) => ({ id: planId })) } : undefined,
      },
      include: { plans: true },
    });
  }

  async softDelete(id: string) {
    return prisma.agent.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }
}
