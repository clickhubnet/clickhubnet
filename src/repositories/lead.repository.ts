import { prisma } from "@/lib/prisma";
import type { Prisma, User } from "@prisma/client";
import type { CreateLeadInput, UpdateLeadInput } from "@/modules/leads/types/lead";

export class LeadRepository {
  async findMany(user?: Pick<User, "id" | "role">) {
    return prisma.lead.findMany({
      where: buildLeadAccessWhere(user),
      orderBy: { createdAt: "desc" },
      include: { assignedUser: true, plan: true, kanbanStage: true },
      take: 100,
    });
  }

  async findById(id: string, user?: Pick<User, "id" | "role">) {
    return prisma.lead.findFirst({
      where: { id, ...buildLeadAccessWhere(user) },
      include: {
        assignedUser: true,
        plan: true,
        kanbanStage: true,
        appointments: {
          where: { deletedAt: null },
          include: { responsible: true },
          orderBy: { startsAt: "desc" },
          take: 10,
        },
        conversations: {
          where: { deletedAt: null },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async create(data: CreateLeadInput) {
    const normalized = await normalizeLeadData(data);
    return prisma.lead.create({
      data: {
        ...normalized,
        source: normalized.source ?? "manual",
      } as Prisma.LeadUncheckedCreateInput,
    });
  }

  async update(id: string, data: UpdateLeadInput, actorUserId?: string) {
    const normalized = await normalizeLeadData(data);
    const current = await prisma.lead.findUnique({ where: { id }, select: { status: true, wonAt: true, closedByUserId: true } });
    const stage = normalized.kanbanStageId
      ? await prisma.leadKanbanStage.findFirst({
          where: { id: normalized.kanbanStageId, active: true, deletedAt: null },
          select: { status: true },
        })
      : null;
    const status = stage?.status ?? normalized.status;
    const nextData = {
      ...normalized,
      ...(stage ? { status: stage.status } : {}),
      ...(status === "WON" && !current?.wonAt ? { wonAt: new Date() } : {}),
      ...(status === "WON" && actorUserId && !current?.closedByUserId ? { closedByUserId: actorUserId } : {}),
      ...(status && status !== "WON" ? { wonAt: null } : {}),
      ...(status && status !== "WON" ? { closedByUserId: null } : {}),
    };

    return prisma.lead.update({
      where: { id },
      data: nextData as Prisma.LeadUncheckedUpdateInput,
    });
  }

  async softDelete(id: string) {
    return prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listStages() {
    return prisma.leadKanbanStage.findMany({
      where: { active: true, deletedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createStage(input: { name: string }) {
    const lastStage = await prisma.leadKanbanStage.findFirst({
      where: { deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    return prisma.leadKanbanStage.create({
      data: {
        name: input.name,
        status: "CONTACTED",
        order: (lastStage?.order ?? 0) + 10,
      },
    });
  }

  async updateStage(id: string, input: { name: string }) {
    return prisma.leadKanbanStage.update({
      where: { id },
      data: { name: input.name },
    });
  }

  async deleteStage(id: string) {
    const stage = await prisma.leadKanbanStage.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!stage) {
      return null;
    }

    return prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { kanbanStageId: id, deletedAt: null },
        data: {
          kanbanStageId: null,
          status: stage.status,
          ...(stage.status === "WON" ? { wonAt: new Date() } : { wonAt: null }),
        },
      });

      return tx.leadKanbanStage.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      });
    });
  }
}

function buildLeadAccessWhere(user?: Pick<User, "id" | "role">) {
  return {
    deletedAt: null,
    ...(user?.role === "EMPLOYEE" ? { assignedUserId: user.id } : {}),
  };
}

async function normalizeLeadData(data: CreateLeadInput | UpdateLeadInput) {
  const updateData = data as UpdateLeadInput;
  const plan = data.planId
    ? await prisma.plan.findFirst({ where: { id: data.planId, deletedAt: null }, select: { name: true, price: true } })
    : null;

  return {
    name: data.name,
    phone: data.phone,
    email: emptyToUndefined(data.email),
    cpfCnpj: emptyToUndefined(data.cpfCnpj),
    birthDate: parseDate(data.birthDate),
    cep: emptyToUndefined(data.cep),
    address: emptyToUndefined(data.address),
    streetNumber: emptyToUndefined(data.streetNumber),
    complement: emptyToUndefined(data.complement),
    city: emptyToUndefined(data.city),
    state: emptyToUndefined(data.state),
    neighborhood: emptyToUndefined(data.neighborhood),
    status: updateData.status,
    kanbanStageId: emptyToUndefined(data.kanbanStageId),
    planId: emptyToUndefined(data.planId),
    planName: emptyToUndefined(data.planName) ?? plan?.name,
    planValue: data.planValue ?? (plan ? Number(plan.price) : undefined),
    billingDueDay: typeof data.billingDueDay === "number" ? data.billingDueDay : undefined,
    assignedUserId: emptyToUndefined(data.assignedUserId),
    expectedValue: data.planValue ?? data.expectedValue ?? (plan ? Number(plan.price) : undefined),
    source: data.source,
    notes: emptyToUndefined(data.notes),
  };
}

function emptyToUndefined(value?: string) {
  return value ? value : undefined;
}

function parseDate(value?: string | Date) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
