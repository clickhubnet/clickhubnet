import { prisma } from "@/lib/prisma";
import type { Prisma, User } from "@prisma/client";
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@/modules/compromissos/types/appointment";

export class AppointmentRepository {
  async findMany(user: Pick<User, "id" | "role">) {
    return prisma.appointment.findMany({
      where: buildAppointmentAccessWhere(user),
      include: { lead: true, responsible: true, stage: true, createdBy: true, ownerAdmin: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: 150,
    });
  }

  async findById(id: string, user: Pick<User, "id" | "role">) {
    return prisma.appointment.findFirst({
      where: { id, ...buildAppointmentAccessWhere(user) },
      include: { lead: true, responsible: true, stage: true, createdBy: true, ownerAdmin: true },
    });
  }

  async create(data: CreateAppointmentInput, user: Pick<User, "id" | "role">) {
    const normalized = await normalizeAppointmentData(data);
    return prisma.appointment.create({
      data: {
        ...normalized,
        createdById: user.id,
        ownerAdminId: user.role === "ADMIN" ? user.id : undefined,
      } as Prisma.AppointmentUncheckedCreateInput,
    });
  }

  async update(id: string, data: UpdateAppointmentInput) {
    const normalized = await normalizeAppointmentData(data);
    return prisma.appointment.update({
      where: { id },
      data: normalized as Prisma.AppointmentUncheckedUpdateInput,
    });
  }

  async softDelete(id: string) {
    return prisma.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listStages() {
    return prisma.appointmentStage.findMany({
      where: { active: true, deletedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createStage(input: { name: string }) {
    const lastStage = await prisma.appointmentStage.findFirst({
      where: { deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    return prisma.appointmentStage.create({
      data: { name: input.name, status: input.name, order: (lastStage?.order ?? 0) + 10 },
    });
  }

  async updateStage(id: string, input: { name: string }) {
    return prisma.appointmentStage.update({
      where: { id },
      data: { name: input.name, status: input.name },
    });
  }

  async deleteStage(id: string) {
    const stage = await prisma.appointmentStage.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, status: true },
    });

    if (!stage) return null;

    return prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({
        where: { stageId: id, deletedAt: null },
        data: { stageId: null, status: stage.status },
      });
      return tx.appointmentStage.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      });
    });
  }
}

function buildAppointmentAccessWhere(user: Pick<User, "id" | "role">): Prisma.AppointmentWhereInput {
  const base = { deletedAt: null };

  if (user.role === "ADMIN") {
    return {
      ...base,
      OR: [
        { ownerAdminId: user.id },
        { ownerAdminId: null },
        { responsibleId: user.id },
        { createdById: user.id },
      ],
    };
  }

  return {
    ...base,
    OR: [{ responsibleId: user.id }, { assignedToAll: true }, { createdById: user.id }],
  };
}

async function normalizeAppointmentData(data: CreateAppointmentInput | UpdateAppointmentInput) {
  const stage = data.stageId
    ? await prisma.appointmentStage.findFirst({
        where: { id: data.stageId, active: true, deletedAt: null },
        select: { status: true },
      })
    : null;

  return {
    title: data.title,
    description: emptyToUndefined(data.description),
    status: stage?.status ?? data.status,
    stageId: emptyToUndefined(data.stageId),
    priority: data.priority,
    startsAt: data.startsAt,
    dueAt: data.dueAt,
    leadId: emptyToUndefined(data.leadId),
    responsibleId: data.assignedToAll ? undefined : emptyToUndefined(data.responsibleId),
    assignedToAll: data.assignedToAll,
    order: data.order,
  };
}

function emptyToUndefined(value?: string) {
  return value ? value : undefined;
}
