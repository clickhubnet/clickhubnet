import { AppointmentRepository } from "@/repositories/appointment.repository";
import type { User } from "@prisma/client";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@/modules/compromissos/schemas/appointment.schema";
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@/modules/compromissos/types/appointment";

export class AppointmentService {
  constructor(private readonly appointmentRepository = new AppointmentRepository()) {}

  async list(user: Pick<User, "id" | "role">) {
    return this.appointmentRepository.findMany(user);
  }

  async get(id: string, user: Pick<User, "id" | "role">) {
    return this.appointmentRepository.findById(id, user);
  }

  async create(input: CreateAppointmentInput, user: Pick<User, "id" | "role">) {
    const parsed = createAppointmentSchema.parse(input);
    return this.appointmentRepository.create(normalizeOptionalRelations(parsed), user);
  }

  async update(id: string, input: UpdateAppointmentInput) {
    const parsed = updateAppointmentSchema.parse(input);
    return this.appointmentRepository.update(id, normalizeOptionalRelations(parsed));
  }

  async delete(id: string) {
    return this.appointmentRepository.softDelete(id);
  }

  async listStages() {
    return this.appointmentRepository.listStages();
  }

  async createStage(input: { name: string }) {
    return this.appointmentRepository.createStage(input);
  }

  async updateStage(id: string, input: { name: string }) {
    return this.appointmentRepository.updateStage(id, input);
  }

  async deleteStage(id: string) {
    return this.appointmentRepository.deleteStage(id);
  }
}

function normalizeOptionalRelations<T extends { leadId?: string; responsibleId?: string; stageId?: string }>(input: T) {
  return {
    ...input,
    leadId: input.leadId || undefined,
    responsibleId: input.responsibleId || undefined,
    stageId: input.stageId || undefined,
  };
}
